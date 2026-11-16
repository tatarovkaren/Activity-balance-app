// Подсчёт калорий по фото (бета). Интерфейс не привязан к ИИ: провайдер выбирается в настройках
// (ручной ввод порций, демо, или серверный сервис с любой моделью — см. core/photo/provider.ts).

import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { dm, todayISO, type ISODate } from '../core/dates';
import { FOOD_BY_ID, findFood } from '../core/photo/foods';
import {
  buildDraft,
  biasFactor,
  estimateErrorPct,
  handFromCard,
  HAND_UNIT_LABEL,
  REFERENCE_HAND,
  type ComponentInput,
  type HandProfile,
  type HandUnit,
  type PhotoQuality,
} from '../core/photo/estimate';
import { demoProvider, httpProvider, manualProvider, photoQuota, type FoodPhotoProvider } from '../core/photo/provider';
import { useStore } from '../data/store';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { int, kg } from '../ui/format';

const ENDPOINT = process.env.EXPO_PUBLIC_PHOTO_ENDPOINT;

export function providers(): FoodPhotoProvider[] {
  const list = [manualProvider, demoProvider];
  if (ENDPOINT) list.push(httpProvider(ENDPOINT));
  return list;
}

type Step = 'capture' | 'draft' | 'done';

export function PhotoScreen({ sel }: { sel: ISODate }) {
  const t = useTheme();
  const { data, setDay, logPhoto, addRef, setConsent } = useStore();
  const { profile, hand, consent } = data;
  const [editingHand, setEditingHand] = useState(false);
  const [providerId, setProviderId] = useState(ENDPOINT ? 'http' : 'manual');
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
  const [realGrams, setRealGrams] = useState<number | undefined>();
  const [saveRefName, setSaveRefName] = useState('');
  const today = todayISO();
  const quota = photoQuota(profile.plan, data.photoUsage, today);

  const h = hand || REFERENCE_HAND;
  const draft = useMemo(() => buildDraft(items, { hand: h, quality, hiddenOil: oil, diaryWeights: profile.diaryWeights }), [items, h, quality, oil, profile.diaryWeights]);

  if (!consent.photoAI)
    return (
      <View>
        <Title />
        <Card title="Перед первым снимком" accent={t.amber}>
          <T size={14}>
            Фото еды рядом с рукой — персональные данные. Снимки используются только для оценки порции и удаляются после того, как вы подтвердите запись, если вы не сохранили их сами. Оценка — черновик с честным диапазоном, в дневник попадает только то, что вы подтвердили.
          </T>
          <Gap />
          <Btn kind="solid" title="Согласен(на) на обработку фото" onPress={() => setConsent({ photoAI: today })} testID="photoConsent" />
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
      setErr('Камера недоступна — выберите снимок из галереи.');
    }
  };

  const estimate = async () => {
    if (!top) return;
    if (provider.automatic && quota.left <= 0) {
      setErr(`Лимит оценок исчерпан: ${quota.limit} ${quota.per === 'week' ? 'в неделю' : 'в день'}. Можно ввести порции вручную.`);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await provider.estimate({ photos: { top, side }, hand: h, note, locale: 'ru' });
      if (provider.automatic) logPhoto(today);
      setItems(res.components.length ? res.components : [{ foodId: 'buckwheat', amount: { kind: 'hand', unit: 'fist', count: 1 } }]);
      setQuality(res.quality);
      setOil(res.oilyGuess);
      setRetake(res.retake || []);
      setStep('draft');
    } catch (e) {
      setErr((e as Error).message || 'Не получилось оценить — попробуйте ещё раз или введите порции вручную.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    const cur = data.days[sel] || {};
    const base = cur.kcal || 0;
    setDay(sel, {
      kcal: Math.round(base + draft.kcal),
      kcalManual: true,
      protein: Math.round(((cur.protein || 0) + draft.p) * 10) / 10,
      fat: Math.round(((cur.fat || 0) + draft.f) * 10) / 10,
      carbs: Math.round(((cur.carbs || 0) + draft.c) * 10) / 10,
    });
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
    setTop(undefined);
    setSide(undefined);
    setNote('');
    setRealGrams(undefined);
    setSaveRefName('');
    setStep('capture');
  };

  const errors = data.refs.map((r) => (r.estGrams ? estimateErrorPct(r.estGrams, r.grams) : null)).filter((x): x is number => x != null);
  const bias = biasFactor(errors);

  return (
    <View>
      <Title />
      {step === 'capture' ? (
        <>
          <Card title="Два снимка" accent={t.amber}>
            <T muted size={13}>Рука на одном уровне с тарелкой. Первый снимок — сверху, второй — сбоку под 30–45°. Начинку (пирог, ролл) — в разрезе.</T>
            <Gap />
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Slot label="Сверху" uri={top} onCamera={() => pick('top', true)} onGallery={() => pick('top', false)} onClear={() => setTop(undefined)} />
              <Slot label="Сбоку 30–45°" uri={side} onCamera={() => pick('side', true)} onGallery={() => pick('side', false)} onClear={() => setSide(undefined)} />
            </Row>
            <Gap />
            <TextField value={note} onChange={setNote} placeholder="Подсказка: «гречка с котлетой, ресторан»" />
            <Gap />
            <T muted size={12}>Как считать</T>
            <Seg value={providerId} onChange={setProviderId} options={providers().map((p) => ({ v: p.id, label: p.label }))} testID="provider" />
            <Gap h={6} />
            <T muted size={12}>
              {provider.automatic
                ? `Автоматических оценок: осталось ${quota.left} из ${quota.limit} ${quota.per === 'week' ? 'за 7 дней' : 'сегодня'} (${profile.plan === 'free' ? 'бесплатный' : 'премиум'} тариф).`
                : 'Без ИИ: вы описываете порции в ладонях и кулаках — приложение переводит их в граммы по размерам вашей руки.'}
              {provider.id === 'demo' ? ' Демо не смотрит на снимок, а показывает, как выглядит черновик.' : ''}
            </T>
            {err ? <Note color={t.red}>{err}</Note> : null}
            <Gap />
            <Btn kind="solid" title={busy ? 'Считаю…' : provider.automatic ? 'Оценить по фото' : 'Перейти к порциям'} onPress={estimate} disabled={!top || busy} testID="estimate" />
            {!top ? <T muted size={12}>Нужен хотя бы снимок сверху.</T> : null}
          </Card>
          <Card title="Масштаб" accent={t.teal} right={<Btn small title="Изменить" onPress={() => setEditingHand(true)} />}>
            <T size={13}>
              Ладонь {kg(h.palmWidth)}×{kg(h.palmLength)} см · кулак {kg(h.fistWidth)}×{kg(h.fistHeight)} см · большой палец {kg(h.thumbLength)} см
            </T>
            <T muted size={12}>{h.source === 'card' ? 'проверено по банковской карте' : 'введено вручную'}</T>
          </Card>
        </>
      ) : null}

      {step === 'draft' ? (
        <Card title="Черновик · проверьте" accent={t.amber}>
          {retake.map((x) => (
            <Note key={x}>📷 {x}</Note>
          ))}
          {items.map((it, i) => (
            <ComponentEditor
              key={i}
              value={it}
              hand={h}
              onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))}
              onRemove={() => setItems(items.filter((_, j) => j !== i))}
              computed={draft.components[i]}
            />
          ))}
          <Btn small title="+ Добавить продукт" onPress={() => setItems([...items, { foodId: 'veg_fresh', amount: { kind: 'hand', unit: 'fist', count: 1 } }])} />
          <Divider />
          <Row>
            <T size={13}>Скрытое масло (жарка, ресторан) +50–100 ккал</T>
            <Seg value={oil ? 'y' : 'n'} onChange={(v) => setOil(v === 'y')} options={[{ v: 'n', label: 'нет' }, { v: 'y', label: 'да' }]} />
          </Row>
          <Gap h={6} />
          <View style={{ gap: 6 }}>
            <T size={13}>Качество снимков</T>
            <Seg<PhotoQuality> value={quality} onChange={setQuality} options={[{ v: 'good', label: 'хорошее ±15%' }, { v: 'topOnly', label: 'только сверху ±20%' }, { v: 'poor', label: 'плохое ±30%' }]} />
          </View>
          <Divider />
          {draft.hiddenOil ? <T size={13}>Масло (скрытое) ≈ +{draft.hiddenOil.kcal} ккал</T> : null}
          <T size={18} bold>
            Итого ≈ <T bold mono size={18} color={t.amber}>{int(draft.kcal)} ккал</T>
          </T>
          <T muted size={13}>
            диапазон {int(draft.kcalMin)}–{int(draft.kcalMax)} (±{draft.rangePct}%) · Б {kg(draft.p)} · Ж {kg(draft.f)} · У {kg(draft.c)} · ≈{int(draft.grams)} г
          </T>
          {bias ? <T muted size={12}>По вашим эталонам оценки {bias < 1 ? 'завышают' : 'занижают'} вес в среднем на {Math.round(Math.abs(1 / bias - 1) * 100)}% — поправка появится во второй очереди.</T> : null}
          <Divider />
          <T muted size={12}>Взвесили порцию? Введите реальный вес — сохраним как личный эталон и покажем ошибку оценки.</T>
          <Fields>
            <NumField label="Реальный вес, г" value={realGrams} onChange={setRealGrams} />
            <TextField label="Название эталона" value={saveRefName} onChange={setSaveRefName} placeholder="Гречка с котлетой" />
          </Fields>
          {realGrams ? <T muted size={12}>Ошибка оценки веса: {kg(estimateErrorPct(draft.grams, realGrams) || 0, 0)}%</T> : null}
          <Gap />
          <Row>
            <Btn kind="solid" title={`Добавить в дневник за ${dm(sel)}`} onPress={confirm} disabled={!draft.components.length} testID="confirmPhoto" style={{ flexGrow: 1 }} />
            <Btn title="Отмена" onPress={reset} />
          </Row>
          <T muted size={12}>Калории прибавятся к уже записанным за день. Снимки после подтверждения удаляются.</T>
        </Card>
      ) : null}

      {step === 'done' ? (
        <Card accent={t.green}>
          <T>Добавлено в дневник за {dm(sel)}: {int(draft.kcal)} ккал. Снимки удалены.</T>
          <Gap />
          <Btn kind="solid" title="Ещё блюдо" onPress={reset} />
        </Card>
      ) : null}

      {data.refs.length ? (
        <Card title="Личные эталоны" accent={t.violet}>
          {data.refs.slice(0, 10).map((r) => {
            const e = r.estGrams ? estimateErrorPct(r.estGrams, r.grams) : null;
            return (
              <T key={r.id} size={13}>
                {dm(r.date)} · {r.name}: {r.grams} г, {r.kcal} ккал{e != null ? ` · оценка ${e > 0 ? '+' : ''}${Math.round(e)}%` : ''}
              </T>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

function Title() {
  return (
    <View style={{ marginBottom: 12 }}>
      <T size={22} bold>Фото блюда <T size={12} muted>бета</T></T>
      <T muted size={13}>2 снимка: сверху и сбоку, рука рядом для масштаба</T>
    </View>
  );
}

function Slot({ label, uri, onCamera, onGallery, onClear }: { label: string; uri?: string; onCamera: () => void; onGallery: () => void; onClear: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, gap: 6 }}>
      <T muted size={12}>{label}</T>
      <View style={{ height: 130, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.input, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <T muted size={28}>📷</T>}
      </View>
      <Row gap={6}>
        <Btn small title="Камера" onPress={onCamera} />
        <Btn small title="Галерея" onPress={onGallery} />
        {uri ? <Btn small kind="link" title="убрать" onPress={onClear} color={t.muted} /> : null}
      </Row>
    </View>
  );
}

function ComponentEditor({
  value,
  onChange,
  onRemove,
  computed,
}: {
  value: ComponentInput;
  hand: HandProfile;
  onChange: (v: ComponentInput) => void;
  onRemove: () => void;
  computed?: { grams: number; kcal: number; diaryNote?: string };
}) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const food = value.foodId ? FOOD_BY_ID[value.foodId] : undefined;
  const a = value.amount;
  const unit: HandUnit | 'grams' = a.kind === 'hand' ? a.unit : 'grams';
  return (
    <View style={{ borderBottomWidth: 1, borderColor: t.line, paddingVertical: 8, gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => setOpen(!open)} style={{ flexShrink: 1 }}>
          <T bold size={14}>{food?.name || value.name || 'Продукт'} ▾</T>
        </Pressable>
        <T mono size={13} color={t.amber}>{computed ? `≈${computed.grams} г · ${computed.kcal} ккал` : '—'}</T>
      </Row>
      {computed?.diaryNote ? <T muted size={12}>в дневник: {computed.diaryNote}</T> : null}
      {open ? (
        <View style={{ gap: 4 }}>
          <TextField value={search} onChange={setSearch} placeholder="Найти продукт" />
          <Row gap={6}>
            {findFood(search)
              .slice(0, 12)
              .map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    onChange({ ...value, foodId: f.id, name: undefined });
                    setOpen(false);
                  }}
                >
                  <T size={12} color={f.id === value.foodId ? t.amber : t.muted}>{f.name}</T>
                </Pressable>
              ))}
          </Row>
        </View>
      ) : null}
      <Row gap={6} style={{ alignItems: 'flex-end' }}>
        <NumField
          width={90}
          label={unit === 'grams' ? 'граммы' : 'сколько'}
          value={a.kind === 'hand' ? a.count : a.kind === 'grams' ? a.grams : undefined}
          digits={unit === 'grams' ? 0 : 2}
          onChange={(v) =>
            onChange({ ...value, amount: unit === 'grams' ? { kind: 'grams', grams: v || 0 } : { kind: 'hand', unit: unit as HandUnit, count: v || 0 } })
          }
        />
        <View style={{ flex: 1, minWidth: 200 }}>
          <Seg
            value={unit}
            onChange={(u) =>
              onChange({
                ...value,
                amount: u === 'grams' ? { kind: 'grams', grams: computed?.grams || 100 } : { kind: 'hand', unit: u as HandUnit, count: a.kind === 'hand' ? a.count : 1 },
              })
            }
            options={[
              { v: 'fist', label: 'кулак' },
              { v: 'palm', label: 'ладонь' },
              { v: 'cupped', label: 'горсть' },
              { v: 'thumb', label: 'палец' },
              { v: 'grams', label: 'г' },
            ]}
          />
        </View>
        <Btn small kind="link" title="убрать" color={t.red} onPress={onRemove} />
      </Row>
      {unit !== 'grams' ? <T muted size={11}>{HAND_UNIT_LABEL[unit as HandUnit]}</T> : null}
    </View>
  );
}

/** Онбординг-замер руки: основной способ — вручную в см; проверка — снимок ладони с банковской картой. */
export function HandSetup({ initial, onDone }: { initial?: HandProfile; onDone: () => void }) {
  const t = useTheme();
  const { setHand } = useStore();
  const [h, setH] = useState<Partial<HandProfile>>(initial || {});
  const [photo, setPhoto] = useState<{ uri: string } | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const ok = !!(h.palmWidth && h.palmLength && h.fistWidth && h.fistHeight && h.thumbLength);
  const cardPx = taps.length >= 2 ? Math.abs(taps[1] - taps[0]) : 0;
  const palmPx = taps.length >= 4 ? Math.abs(taps[3] - taps[2]) : 0;
  const measured = taps.length >= 4 ? handFromCard(cardPx, palmPx) : null;
  const TAP_HINTS = ['левый край карты', 'правый край карты', 'левый край ладони', 'правый край ладони'];

  return (
    <View>
      <Title />
      <Card title="Замер руки" accent={t.teal}>
        <T muted size={13}>Рука — линейка для фото. Измерьте один раз сантиметром или линейкой. Пример в подсказках — размеры средней мужской руки.</T>
        <Gap />
        <Fields>
          <NumField label="Ширина ладони, см" value={h.palmWidth} onChange={(v) => setH({ ...h, palmWidth: v })} placeholder={String(REFERENCE_HAND.palmWidth)} digits={1} testID="palmWidth" />
          <NumField label="Длина ладони, см" value={h.palmLength} onChange={(v) => setH({ ...h, palmLength: v })} placeholder="10,5" digits={1} testID="palmLength" />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label="Кулак ширина, см" value={h.fistWidth} onChange={(v) => setH({ ...h, fistWidth: v })} placeholder="9" digits={1} testID="fistWidth" />
          <NumField label="Кулак высота, см" value={h.fistHeight} onChange={(v) => setH({ ...h, fistHeight: v })} placeholder="10" digits={1} testID="fistHeight" />
          <NumField label="Большой палец, см" value={h.thumbLength} onChange={(v) => setH({ ...h, thumbLength: v })} placeholder="6,5" digits={1} testID="thumbLength" />
        </Fields>
        <Gap />
        <Row>
          <Btn
            kind="solid"
            title="Сохранить"
            disabled={!ok}
            testID="saveHand"
            onPress={() => {
              setHand({ ...(h as HandProfile), source: measured ? 'card' : 'manual', measuredAt: todayISO() });
              onDone();
            }}
          />
          <Btn title="Взять средние размеры" onPress={() => setH({ ...REFERENCE_HAND })} />
        </Row>
      </Card>

      <Card title="Проверка по банковской карте" accent={t.muted}>
        <T muted size={13}>Положите ладонь рядом с картой (85,6 × 54 мм) и сфотографируйте сверху. Затем отметьте касанием 4 точки по горизонтали.</T>
        <Gap h={6} />
        <Btn
          small
          title={photo ? 'Другой снимок' : 'Выбрать снимок'}
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
            <T size={13} color={t.amber}>{taps.length < 4 ? `Коснитесь: ${TAP_HINTS[taps.length]}` : 'Готово'}</T>
            <Pressable onPress={(ev) => taps.length < 4 && setTaps([...taps, ev.nativeEvent.locationX])}>
              <Image source={photo} style={{ width: '100%', height: 240, borderRadius: 10 }} resizeMode="contain" />
            </Pressable>
            {measured ? (
              <T size={13}>
                Ширина ладони по фото ≈ {kg(measured)} см
                {h.palmWidth ? ` · введено ${kg(h.palmWidth)} см (${Math.abs(measured - h.palmWidth) <= 0.7 ? 'совпадает' : 'проверьте замер'})` : ''}
              </T>
            ) : null}
            <Row>
              {measured ? <Btn small title="Подставить ширину" onPress={() => setH({ ...h, palmWidth: measured })} /> : null}
              {taps.length ? <Btn small kind="link" title="сбросить точки" onPress={() => setTaps([])} /> : null}
            </Row>
          </>
        ) : null}
      </Card>
    </View>
  );
}
