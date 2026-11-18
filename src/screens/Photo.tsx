// Подсчёт калорий по фото (бета). Интерфейс не привязан к ИИ: провайдер выбирается в настройках
// (ручной ввод порций, демо, или серверный сервис с любой моделью — см. core/photo/provider.ts).

import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { todayISO, type ISODate } from '../core/dates';
import { FOOD_BY_ID, FOODS } from '../core/photo/foods';
import {
  buildDraft,
  biasFactor,
  estimateErrorPct,
  handFromCard,
  REFERENCE_HAND,
  type ComponentInput,
  type HandProfile,
  type HandUnit,
  type PhotoQuality,
} from '../core/photo/estimate';
import { demoProvider, httpProvider, manualProvider, photoQuota, PhotoLimitError, type FoodPhotoProvider } from '../core/photo/provider';
import { editsSummary, mealFromDraft } from '../core/photo/meals';
import { MEAL_SLOTS, type MealSlot } from '../core/types';
import { useStore } from '../data/store';
import { accessToken, photoEndpoint } from '../data/cloud';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { errorText, foodName, useI18n, type I18n } from '../i18n';

const ENDPOINT = photoEndpoint();
const HTTP = ENDPOINT ? httpProvider(ENDPOINT, accessToken) : null;

/** Без сервера — демо-ответ (весь путь виден, снимок не анализируется); с сервером — настоящая оценка. */
export function providers(): FoodPhotoProvider[] {
  const list = [manualProvider, demoProvider];
  if (HTTP) list.push(HTTP);
  return list;
}

/** Приём пищи по времени суток: до 11 — завтрак, до 16 — обед, до 21 — ужин, иначе перекус. */
export function mealByTime(d = new Date()): MealSlot {
  const h = d.getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
}

type Step = 'capture' | 'draft' | 'done';

/** Поиск по справочнику на языке интерфейса (и по русскому названию — для смешанного ввода). */
function findFoodL(L: I18n, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return FOODS;
  return FOODS.filter((x) => foodName(L, x.id).toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
}

export function PhotoScreen({ sel, meal: mealProp, onBack }: { sel: ISODate; meal?: MealSlot; onBack?: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const Ph = tx.photo;
  const { int, dm } = f;
  const kg = f.num;
  const { data, plan, addMeal, logPhoto, addRef, setConsent } = useStore();
  const { profile, hand, consent } = data;
  const [editingHand, setEditingHand] = useState(false);
  const [providerId, setProviderId] = useState(HTTP ? 'http' : 'demo');
  const [meal, setMeal] = useState<MealSlot>(mealProp || mealByTime());
  /** Граммы каждого продукта в ответе ИИ (до правки), по индексу items; undefined — добавлен вручную. */
  const [est, setEst] = useState<(number | undefined)[]>([]);
  const provider = providers().find((p) => p.id === providerId) || manualProvider;
  const [top, setTop] = useState<string | undefined>();
  const [side, setSide] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [step, setStep] = useState<Step>('capture');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<ComponentInput[]>([]);
  const [quality, setQuality] = useState<PhotoQuality>('good');
  const [oil, setOil] = useState(false);
  const [retake, setRetake] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [realGrams, setRealGrams] = useState<number | undefined>();
  const [saveRefName, setSaveRefName] = useState('');
  const today = todayISO();
  const quota = photoQuota(plan, data.photoUsage, today);

  const h = hand || REFERENCE_HAND;
  const draft = useMemo(() => buildDraft(items, { hand: h, quality, hiddenOil: oil, diaryWeights: profile.diaryWeights }), [items, h, quality, oil, profile.diaryWeights]);

  if (!consent.photoAI)
    return (
      <View>
        <Title />
        <Card title={Ph.consentTitle} accent={t.amber}>
          <T size={14}>{Ph.consentText}</T>
          <Gap />
          <Btn kind="solid" title={Ph.consentBtn} onPress={() => setConsent({ photoAI: today })} testID="photoConsent" />
        </Card>
      </View>
    );

  if (!hand || editingHand) return <HandSetup initial={hand} onDone={() => setEditingHand(false)} />;

  const pick = async (which: 'top' | 'side', camera: boolean) => {
    setErr('');
    try {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.length) return;
      const a = r.assets[0];
      // data: URL — чтобы снимок можно было отправить серверу оценки любой моделью
      const uri = a.base64 ? `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}` : a.uri;
      which === 'top' ? setTop(uri) : setSide(uri);
    } catch {
      setErr(Ph.cameraError);
    }
  };

  const estimate = async () => {
    if (!top) return;
    // лимит пока только считаем: блокирует сервер (ответ 429), без сервера — только предупреждение
    setBusy(true);
    setErr('');
    try {
      const res = await provider.estimate({ photos: { top, side }, hand: h, note, locale: L.lang });
      if (provider.automatic) logPhoto(today);
      const comps: ComponentInput[] = res.components.length ? res.components : [{ foodId: 'buckwheat', amount: { kind: 'hand', unit: 'fist', count: 1 } }];
      setItems(comps);
      // что предложил ИИ — запоминаем, чтобы при сохранении записать ошибку правки граммов
      const first = buildDraft(comps, { hand: h, quality: res.quality, hiddenOil: false, diaryWeights: profile.diaryWeights });
      setEst(provider.automatic && res.components.length ? comps.map((c) => first.components.find((x) => x.amount === c.amount)?.grams) : comps.map(() => undefined));
      setQuality(res.quality);
      setOil(res.oilyGuess);
      setRetake(res.retake || []);
      setComment(res.comment || '');
      setStep('draft');
    } catch (e) {
      if (e instanceof PhotoLimitError) setErr(Ph.limit(e.limit || quota.limit, quota.fairUse));
      else setErr(errorText(L, e) || Ph.failed);
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    // приём «по фото» прибавляется к записанному за день (руками или из FatSecret), ничего не затирая
    const at = Date.now();
    addMeal(sel, mealFromDraft(draft, { id: String(at), meal, provider: provider.id, at }, est));
    if (realGrams && saveRefName.trim()) {
      addRef({ id: String(Date.now()), date: sel, name: saveRefName.trim(), grams: realGrams, kcal: Math.round((draft.kcal * realGrams) / Math.max(1, draft.grams)), estGrams: draft.grams });
    }
    // снимки не храним: после подтверждения удаляются из памяти приложения
    setTop(undefined);
    setSide(undefined);
    setStep('done');
  };

  const reset = () => {
    setItems([]);
    setEst([]);
    setTop(undefined);
    setSide(undefined);
    setNote('');
    setRealGrams(undefined);
    setSaveRefName('');
    setStep('capture');
  };

  const errors = data.refs.map((r) => (r.estGrams ? estimateErrorPct(r.estGrams, r.grams) : null)).filter((x): x is number => x != null);
  const bias = biasFactor(errors);
  const edits = editsSummary(data.photoEdits || []);

  return (
    <View>
      <Title />
      {step === 'capture' ? (
        <>
          <Card title={Ph.mealFor(dm(sel))} accent={t.amber}>
            <Seg<MealSlot> value={meal} onChange={setMeal} options={MEAL_SLOTS.map((m) => ({ v: m, label: tx.meals[m] }))} testID="mealSlot" />
          </Card>
          <Card title={Ph.twoShots} accent={t.amber}>
            <T muted size={13}>{Ph.twoShotsHint}</T>
            <Gap />
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Slot label={Ph.top} uri={top} onCamera={() => pick('top', true)} onGallery={() => pick('top', false)} onClear={() => setTop(undefined)} />
              <Slot label={Ph.side} uri={side} onCamera={() => pick('side', true)} onGallery={() => pick('side', false)} onClear={() => setSide(undefined)} />
            </Row>
            <Gap />
            <TextField value={note} onChange={setNote} placeholder={Ph.notePlaceholder} />
            <Gap />
            <T muted size={12}>{Ph.howToCount}</T>
            <Seg value={providerId} onChange={setProviderId} options={providers().map((p) => ({ v: p.id, label: Ph.providers[p.id] || p.id }))} testID="provider" />
            <Gap h={6} />
            <T muted size={12}>
              {provider.automatic ? Ph.quota(quota.used, quota.limit, quota.fairUse) : Ph.manualHint}
              {provider.id === 'demo' ? Ph.demoHint : ''}
            </T>
            {provider.automatic && quota.left <= 0 ? <Note>{Ph.overLimit}</Note> : null}
            {err ? <Note color={t.red}>{err}</Note> : null}
            <Gap />
            <Btn kind="solid" title={busy ? Ph.busy : provider.automatic ? Ph.estimate : Ph.toPortions} onPress={estimate} disabled={!top || busy} testID="estimate" />
            {!top ? <T muted size={12}>{Ph.needTop}</T> : null}
          </Card>
          <Card title={Ph.scaleTitle} accent={t.teal} right={<Btn small title={tx.common.change} onPress={() => setEditingHand(true)} />}>
            <T size={13}>{Ph.handLine(kg(h.palmWidth), kg(h.palmLength), kg(h.fistWidth), kg(h.fistHeight), kg(h.thumbLength))}</T>
            <T muted size={12}>{h.source === 'card' ? Ph.byCard : Ph.manualEntered}</T>
          </Card>
        </>
      ) : null}

      {step === 'draft' ? (
        <Card title={Ph.draftTitle} accent={t.amber}>
          {retake.map((x) => (
            <Note key={x}>📷 {Ph.retake[x] || x}</Note>
          ))}
          {comment ? <T muted size={12}>{comment}</T> : null}
          {items.map((it, i) => (
            <ComponentEditor
              key={i}
              value={it}
              hand={h}
              estGrams={est[i]}
              onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))}
              onRemove={() => {
                setItems(items.filter((_, j) => j !== i));
                setEst(est.filter((_, j) => j !== i));
              }}
              computed={draft.components.find((c) => c.amount === it.amount)}
            />
          ))}
          <Btn
            small
            title={Ph.addFood}
            onPress={() => {
              setItems([...items, { foodId: 'veg_fresh', amount: { kind: 'hand', unit: 'fist', count: 1 } }]);
              setEst([...est, undefined]);
            }}
          />
          <Divider />
          <Row>
            <T size={13}>{Ph.hiddenOil}</T>
            <Seg value={oil ? 'y' : 'n'} onChange={(v) => setOil(v === 'y')} options={[{ v: 'n', label: tx.common.no }, { v: 'y', label: tx.common.yes }]} />
          </Row>
          <Gap h={6} />
          <View style={{ gap: 6 }}>
            <T size={13}>{Ph.quality}</T>
            <Seg<PhotoQuality> value={quality} onChange={setQuality} options={[{ v: 'good', label: Ph.qGood }, { v: 'topOnly', label: Ph.qTop }, { v: 'poor', label: Ph.qPoor }]} />
          </View>
          <Divider />
          {draft.hiddenOil ? <T size={13}>{Ph.oilLine(draft.hiddenOil.kcal)}</T> : null}
          <T size={18} bold>
            {Ph.total}
            <T bold mono size={18} color={t.amber}>
              {int(draft.kcal)} {tx.common.kcal}
            </T>
          </T>
          <T muted size={13}>{Ph.range(int(draft.kcalMin), int(draft.kcalMax), draft.rangePct, kg(draft.p), kg(draft.f), kg(draft.c), int(draft.grams))}</T>
          {bias ? <T muted size={12}>{Ph.bias(bias < 1, Math.round(Math.abs(1 / bias - 1) * 100))}</T> : null}
          <Divider />
          <T muted size={12}>{Ph.weighed}</T>
          <Fields>
            <NumField label={Ph.realGrams} value={realGrams} onChange={setRealGrams} />
            <TextField label={Ph.refName} value={saveRefName} onChange={setSaveRefName} placeholder={Ph.refPlaceholder} />
          </Fields>
          {realGrams ? <T muted size={12}>{Ph.error(kg(estimateErrorPct(draft.grams, realGrams) || 0, 0))}</T> : null}
          <Gap />
          <Row>
            <Btn kind="solid" title={Ph.addToDiary(tx.meals[meal].toLowerCase(), dm(sel))} onPress={confirm} disabled={!draft.components.length} testID="confirmPhoto" style={{ flexGrow: 1 }} />
            <Btn title={tx.common.cancel} onPress={reset} />
          </Row>
          <T muted size={12}>{Ph.addNote}</T>
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card accent={t.green}>
          <T>{Ph.added(tx.meals[meal].toLowerCase(), dm(sel), int(draft.kcal))}</T>
          <Gap />
          <Row>
            {onBack ? <Btn kind="solid" title={Ph.toDiary} onPress={onBack} testID="photoToDiary" /> : null}
            <Btn kind={onBack ? undefined : 'solid'} title={Ph.more} onPress={reset} />
          </Row>
        </Card>
      ) : null}

      {edits ? (
        <Card title={Ph.editsTitle} accent={t.violet}>
          <T size={13}>{Ph.editsLine(edits.n, edits.medianPct)}</T>
        </Card>
      ) : null}

      {data.refs.length ? (
        <Card title={Ph.refsTitle} accent={t.violet}>
          {data.refs.slice(0, 10).map((r) => {
            const e = r.estGrams ? estimateErrorPct(r.estGrams, r.grams) : null;
            return (
              <T key={r.id} size={13}>
                {Ph.refLine(dm(r.date), r.name, r.grams, r.kcal, e != null ? `${e > 0 ? '+' : ''}${Math.round(e)}%` : '')}
              </T>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

function Title() {
  const { tx } = useI18n();
  return (
    <View style={{ marginBottom: 12 }}>
      <T size={22} bold>
        {tx.photo.title} <T size={12} muted>{tx.photo.beta}</T>
      </T>
      <T muted size={13}>{tx.photo.subtitle}</T>
    </View>
  );
}

function Slot({ label, uri, onCamera, onGallery, onClear }: { label: string; uri?: string; onCamera: () => void; onGallery: () => void; onClear: () => void }) {
  const t = useTheme();
  const { tx } = useI18n();
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, gap: 6 }}>
      <T muted size={12}>{label}</T>
      <View style={{ height: 130, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.input, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <T muted size={28}>📷</T>}
      </View>
      <Row gap={6}>
        <Btn small title={tx.photo.camera} onPress={onCamera} />
        <Btn small title={tx.photo.gallery} onPress={onGallery} testID="gallery" />
        {uri ? <Btn small kind="link" title={tx.common.remove} onPress={onClear} color={t.muted} /> : null}
      </Row>
    </View>
  );
}

function ComponentEditor({
  value,
  onChange,
  onRemove,
  computed,
  estGrams,
}: {
  value: ComponentInput;
  hand: HandProfile;
  /** Граммы в оценке ИИ — показываем, если пользователь их поправил. */
  estGrams?: number;
  onChange: (v: ComponentInput) => void;
  onRemove: () => void;
  computed?: { grams: number; kcal: number; diaryGrams?: number; diaryKind?: 'dry' | 'raw' };
}) {
  const t = useTheme();
  const L = useI18n();
  const Ph = L.tx.photo;
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  // меры руки — запасной способ, по умолчанию свёрнуты (главное поле — граммы)
  const [handOpen, setHandOpen] = useState(value.amount.kind === 'hand' && estGrams == null);
  const food = value.foodId ? FOOD_BY_ID[value.foodId] : undefined;
  const a = value.amount;
  const unit: HandUnit | 'grams' = a.kind === 'hand' ? a.unit : 'grams';
  return (
    <View style={{ borderBottomWidth: 1, borderColor: t.line, paddingVertical: 8, gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => setOpen(!open)} style={{ flexShrink: 1 }}>
          <T bold size={14}>{(food ? foodName(L, food.id) : value.name) || Ph.product} ▾</T>
        </Pressable>
        <T mono size={13} color={t.amber}>{computed ? `${computed.kcal} ${L.tx.common.kcal}` : '—'}</T>
      </Row>
      {/* граммы — главное поле правки: ИИ предлагает, пользователь поправляет */}
      <Row gap={6} style={{ alignItems: 'flex-end' }}>
        <NumField
          width={110}
          label={Ph.gramsLabel}
          value={computed?.grams}
          digits={0}
          suffix={L.tx.common.g}
          testID="itemGrams"
          onChange={(v) => onChange({ ...value, amount: { kind: 'grams', grams: v || 0 } })}
        />
        {estGrams != null && computed && Math.abs(computed.grams - estGrams) >= 3 ? (
          <T muted size={12}>{Ph.aiSaid(estGrams)}</T>
        ) : null}
      </Row>
      {computed?.diaryKind && computed.diaryGrams ? <T muted size={12}>{Ph.diary(computed.diaryGrams, computed.diaryKind)}</T> : null}
      {open ? (
        <View style={{ gap: 4 }}>
          <TextField value={search} onChange={setSearch} placeholder={Ph.findFood} />
          <Row gap={6}>
            {findFoodL(L, search)
              .slice(0, 12)
              .map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    onChange({ ...value, foodId: f.id, name: undefined });
                    setOpen(false);
                  }}
                >
                  <T size={12} color={f.id === value.foodId ? t.amber : t.muted}>{foodName(L, f.id)}</T>
                </Pressable>
              ))}
          </Row>
        </View>
      ) : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <Btn small kind="link" title={Ph.orHand + (handOpen ? ' ▴' : ' ▾')} color={t.muted} onPress={() => setHandOpen(!handOpen)} />
        <Btn small kind="link" title={L.tx.common.remove} color={t.red} onPress={onRemove} />
      </Row>
      {handOpen ? (
      <Row gap={6} style={{ alignItems: 'flex-end' }}>
        {unit !== 'grams' ? (
          <NumField
            width={90}
            label={Ph.howMany}
            value={a.kind === 'hand' ? a.count : undefined}
            digits={2}
            onChange={(v) => onChange({ ...value, amount: { kind: 'hand', unit: unit as HandUnit, count: v || 0 } })}
          />
        ) : null}
        <View style={{ flex: 1, minWidth: 200 }}>
          <Seg
            value={unit}
            onChange={(u) =>
              onChange({
                ...value,
                amount: u === 'grams' ? { kind: 'grams', grams: computed?.grams || 100 } : { kind: 'hand', unit: u as HandUnit, count: a.kind === 'hand' ? a.count : 1 },
              })
            }
            options={(['fist', 'palm', 'cupped', 'thumb', 'grams'] as const).map((v) => ({ v, label: Ph.units[v] }))}
          />
        </View>
      </Row>
      ) : null}
      {handOpen && unit !== 'grams' ? <T muted size={11}>{Ph.unitHint[unit as HandUnit]}</T> : null}
    </View>
  );
}

/** Онбординг-замер руки: основной способ — вручную в см; проверка — снимок ладони с банковской картой. */
export function HandSetup({ initial, onDone }: { initial?: HandProfile; onDone: () => void }) {
  const t = useTheme();
  const { tx, f } = useI18n();
  const H = tx.hand;
  const kg = f.num;
  const { setHand } = useStore();
  const [h, setH] = useState<Partial<HandProfile>>(initial || {});
  const [photo, setPhoto] = useState<{ uri: string } | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const ok = !!(h.palmWidth && h.palmLength && h.fistWidth && h.fistHeight && h.thumbLength);
  const cardPx = taps.length >= 2 ? Math.abs(taps[1] - taps[0]) : 0;
  const palmPx = taps.length >= 4 ? Math.abs(taps[3] - taps[2]) : 0;
  const measured = taps.length >= 4 ? handFromCard(cardPx, palmPx) : null;

  return (
    <View>
      <Title />
      <Card title={H.title} accent={t.teal}>
        <T muted size={13}>{H.intro}</T>
        <Gap />
        <Fields>
          <NumField label={H.palmWidth} value={h.palmWidth} onChange={(v) => setH({ ...h, palmWidth: v })} placeholder={f.input(REFERENCE_HAND.palmWidth)} digits={1} testID="palmWidth" />
          <NumField label={H.palmLength} value={h.palmLength} onChange={(v) => setH({ ...h, palmLength: v })} placeholder={f.input(REFERENCE_HAND.palmLength)} digits={1} testID="palmLength" />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label={H.fistWidth} value={h.fistWidth} onChange={(v) => setH({ ...h, fistWidth: v })} placeholder={f.input(REFERENCE_HAND.fistWidth)} digits={1} testID="fistWidth" />
          <NumField label={H.fistHeight} value={h.fistHeight} onChange={(v) => setH({ ...h, fistHeight: v })} placeholder={f.input(REFERENCE_HAND.fistHeight)} digits={1} testID="fistHeight" />
          <NumField label={H.thumb} value={h.thumbLength} onChange={(v) => setH({ ...h, thumbLength: v })} placeholder={f.input(REFERENCE_HAND.thumbLength)} digits={1} testID="thumbLength" />
        </Fields>
        <Gap />
        <Row>
          <Btn
            kind="solid"
            title={H.save}
            disabled={!ok}
            testID="saveHand"
            onPress={() => {
              setHand({ ...(h as HandProfile), source: measured ? 'card' : 'manual', measuredAt: todayISO() });
              onDone();
            }}
          />
          <Btn title={H.average} onPress={() => setH({ ...REFERENCE_HAND })} testID="handAverage" />
        </Row>
      </Card>

      <Card title={H.cardTitle} accent={t.muted}>
        <T muted size={13}>{H.cardIntro}</T>
        <Gap h={6} />
        <Btn
          small
          title={photo ? H.other : H.pick}
          onPress={async () => {
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
            if (!r.canceled && r.assets?.length) {
              setPhoto({ uri: r.assets[0].uri });
              setTaps([]);
            }
          }}
        />
        {photo ? (
          <>
            <Gap h={6} />
            <T size={13} color={t.amber}>{taps.length < 4 ? H.tap(H.taps[taps.length]) : H.ready}</T>
            <Pressable onPress={(ev) => taps.length < 4 && setTaps([...taps, ev.nativeEvent.locationX])}>
              <Image source={photo} style={{ width: '100%', height: 240, borderRadius: 10 }} resizeMode="contain" />
            </Pressable>
            {measured ? (
              <T size={13}>
                {H.measured(kg(measured))}
                {h.palmWidth ? H.entered(kg(h.palmWidth), Math.abs(measured - h.palmWidth) <= 0.7) : ''}
              </T>
            ) : null}
            <Row>
              {measured ? <Btn small title={H.useWidth} onPress={() => setH({ ...h, palmWidth: measured })} /> : null}
              {taps.length ? <Btn small kind="link" title={H.resetTaps} onPress={() => setTaps([])} /> : null}
            </Row>
          </>
        ) : null}
      </Card>
    </View>
  );
}
