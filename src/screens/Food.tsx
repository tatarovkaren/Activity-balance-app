// Ручной ввод еды в дневник через справочник продуктов: поиск по названию (RU/EN), свои продукты
// и поиск по штрихкоду (Open Food Facts). Несколько продуктов — один приём пищи; он прибавляется к КБЖУ дня
// так же, как приём по фото (core/photo/meals.ts), но цифры точные по весу.

import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ISODate } from '../core/dates';
import { FOOD_BY_ID, FOODS, typicalPortion, type Food } from '../core/photo/foods';
import { searchFoods } from '../core/photo/search';
import { customFoodError, foodTotals, kcalMismatch, makeCustomFood, mealFromFoods, type CustomFoodInput, type PickedFood } from '../core/photo/custom';
import { cleanBarcode, fetchOffProduct, OffError } from '../core/photo/off';
import { MEAL_SLOTS, type MealSlot } from '../core/types';
import { useStore } from '../data/store';
import { Btn, Card, Fields, Gap, Note, NumField, Row, Seg, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { canDetectBarcode, detectBarcode } from '../ui/barcode';
import { foodName, useI18n, type I18n } from '../i18n';
import { mealByTime } from './Photo';

/** Что показать без запроса: самые частые продукты дневника. */
const POPULAR = ['buckwheat', 'rice', 'oats', 'chicken_breast', 'egg', 'cottage', 'kefir_25', 'milk_25', 'bread', 'apple', 'banana', 'veg_fresh'];

/** Название продукта на языке интерфейса: встроенный — из словаря, свой — как вписал пользователь. */
export function displayName(L: I18n, f: Food): string {
  return FOOD_BY_ID[f.id] ? foodName(L, f.id) : f.name;
}

export function FoodScreen({ sel, meal: mealProp, onBack }: { sel: ISODate; meal?: MealSlot; onBack?: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const C = tx.catalog;
  const { data, addMeal, saveFood, removeFood } = useStore();
  const mine = data.customFoods || [];
  const [meal, setMeal] = useState<MealSlot>(mealProp || mealByTime());
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PickedFood[]>([]);
  const [done, setDone] = useState<number | null>(null);
  const [own, setOwn] = useState<OwnDraft | null>(null);
  const [info, setInfo] = useState('');

  const all = useMemo(() => [...mine, ...FOODS], [mine]);
  const hits = useMemo(() => searchFoods(query, all, 25).map((h) => h.food), [query, all]);
  const shown = query.trim() ? hits : [...mine.slice(0, 10), ...POPULAR.map((id) => FOOD_BY_ID[id]).filter(Boolean)];

  const pick = (food: Food) => {
    setItems([...items, { food, grams: typicalPortion(food) }]);
    setQuery('');
    setInfo('');
  };
  const total = items.reduce(
    (a, x) => {
      const v = foodTotals(x.food, x.grams || 0);
      return { kcal: a.kcal + v.kcal, p: a.p + v.p, f: a.f + v.f, c: a.c + v.c, g: a.g + (x.grams || 0) };
    },
    { kcal: 0, p: 0, f: 0, c: 0, g: 0 },
  );

  const confirm = () => {
    const at = Date.now();
    const m = mealFromFoods(items, { id: 'c' + at, meal, at });
    addMeal(sel, m);
    setDone(m.kcal);
    setItems([]);
  };

  if (done != null)
    return (
      <View>
        <Title />
        <Card accent={t.green}>
          <T>{C.added(tx.meals[meal].toLowerCase(), f.dm(sel), f.int(done))}</T>
          <Gap />
          <Row>
            {onBack ? <Btn kind="solid" title={C.toDiary} onPress={onBack} testID="foodToDiary" /> : null}
            <Btn kind={onBack ? undefined : 'solid'} title={C.more} onPress={() => setDone(null)} testID="foodMore" />
          </Row>
        </Card>
      </View>
    );

  return (
    <View>
      <Title />
      <Card title={C.mealFor(f.dm(sel))} accent={t.amber}>
        <Seg<MealSlot> value={meal} onChange={setMeal} options={MEAL_SLOTS.map((m) => ({ v: m, label: tx.meals[m] }))} testID="foodMeal" />
      </Card>

      <Card title={C.search} accent={t.amber}>
        <TextField value={query} onChange={setQuery} placeholder={C.searchPlaceholder} testID="foodSearch" />
        <Gap h={6} />
        {!query.trim() ? <T muted size={12}>{mine.length ? C.mine + ' · ' + C.popular : C.popular}</T> : null}
        {shown.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onPick={() => pick(food)}
            onEdit={food.source === 'user' || food.source === 'off' ? () => setOwn({ ...food, source: food.source === 'off' ? 'off' : 'user' }) : undefined}
            onRemove={food.source === 'user' || food.source === 'off' ? () => removeFood(food.id) : undefined}
          />
        ))}
        {query.trim() && !hits.length ? <Note>{C.nothing}</Note> : null}
        {info ? <Note color={t.green}>{info}</Note> : null}
        <Gap h={6} />
        <Row>
          <Btn small title={C.own} onPress={() => setOwn({ name: query.trim() })} testID="ownFood" />
        </Row>
      </Card>

      {own ? (
        <OwnFoodForm
          initial={own}
          onCancel={() => setOwn(null)}
          onSave={(food, andAdd) => {
            saveFood(food);
            if (andAdd) pick(food);
            setOwn(null);
          }}
        />
      ) : null}

      <Card title={C.inMeal} accent={t.green}>
        {!items.length ? <T muted size={13}>{C.emptyMeal}</T> : null}
        {items.map((it, i) => {
          const v = foodTotals(it.food, it.grams || 0);
          const chips = [typicalPortion(it.food), it.food.piece, 100].filter((x, j, a): x is number => !!x && a.indexOf(x) === j);
          return (
            <View key={i} style={{ borderBottomWidth: 1, borderColor: t.line, paddingVertical: 8, gap: 6 }} testID="foodItem">
              <Row style={{ justifyContent: 'space-between' }}>
                <T bold size={14} style={{ flexShrink: 1 }}>{displayName(L, it.food)}</T>
                <T mono size={13} color={t.amber}>{f.int(v.kcal)} {tx.common.kcal}</T>
              </Row>
              <Row gap={6} style={{ alignItems: 'flex-end' }}>
                <NumField
                  width={110}
                  label={C.grams}
                  value={it.grams}
                  digits={0}
                  suffix={tx.common.g}
                  testID="foodGrams"
                  onChange={(g) => setItems(items.map((x, j) => (j === i ? { ...x, grams: g || 0 } : x)))}
                />
                {chips.map((g) => (
                  <Btn
                    key={g}
                    small
                    title={g === it.food.piece ? C.piece(g) : g === 100 ? `100 ${tx.common.g}` : C.portion(g)}
                    onPress={() => setItems(items.map((x, j) => (j === i ? { ...x, grams: g } : x)))}
                  />
                ))}
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <T muted size={12}>{C.totalLine(f.num(v.p), f.num(v.f), f.num(v.c), f.int(it.grams || 0))}</T>
                <Btn small kind="link" title={tx.common.remove} color={t.red} onPress={() => setItems(items.filter((_, j) => j !== i))} />
              </Row>
            </View>
          );
        })}
        {items.length ? (
          <>
            <Gap h={6} />
            <T size={18} bold>
              {C.total}
              <T bold mono size={18} color={t.amber}>
                {f.int(total.kcal)} {tx.common.kcal}
              </T>
            </T>
            <T muted size={13}>{C.totalLine(f.num(total.p), f.num(total.f), f.num(total.c), f.int(total.g))}</T>
            <Gap />
            <Btn kind="solid" title={C.add(tx.meals[meal].toLowerCase(), f.dm(sel))} onPress={confirm} disabled={!total.g} testID="addFoods" />
          </>
        ) : null}
      </Card>
      <BarcodeCard
        onFound={(food) => {
          saveFood(food);
          pick(food);
          setInfo(C.foundOff);
        }}
        onMissing={(code) => setOwn({ name: '', barcode: code })}
      />

      <T muted size={11}>{C.sourcesNote}</T>
    </View>
  );
}

function Title() {
  const { tx } = useI18n();
  return (
    <View style={{ marginBottom: 12 }}>
      <T size={22} bold>{tx.catalog.title}</T>
      <T muted size={13}>{tx.catalog.subtitle}</T>
    </View>
  );
}

function FoodRow({ food, onPick, onEdit, onRemove }: { food: Food; onPick: () => void; onEdit?: () => void; onRemove?: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const C = L.tx.catalog;
  const n = L.f.num;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: t.line, paddingVertical: 6, gap: 8 }}>
      <Pressable onPress={onPick} style={{ flex: 1 }} testID="foodHit">
        <T size={14}>
          {displayName(L, food)}
          {food.brand && !food.name.includes(food.brand) ? <T muted size={12}>{' · ' + food.brand}</T> : null}
        </T>
        <T muted size={12}>
          {C.per100(L.f.int(food.kcal), n(food.p), n(food.f), n(food.c))}
          <T size={11} color={food.source === 'user' || food.source === 'off' ? t.teal : t.muted}>{'  ' + (C.sources[food.source] || food.source)}</T>
        </T>
      </Pressable>
      {onEdit ? <Btn small kind="link" title={C.edit} color={t.muted} onPress={onEdit} /> : null}
      {onRemove ? <Btn small kind="link" title={C.remove} color={t.muted} onPress={onRemove} /> : null}
      <Btn small title="＋" onPress={onPick} />
    </View>
  );
}

/** Черновик своего продукта: новый или правка (тогда есть id и дата создания). */
type OwnDraft = Partial<CustomFoodInput> & { id?: string; createdAt?: number };

function OwnFoodForm({ initial, onSave, onCancel }: { initial: OwnDraft; onSave: (f: Food, andAdd: boolean) => void; onCancel: () => void }) {
  const t = useTheme();
  const { tx } = useI18n();
  const C = tx.catalog;
  const { session } = useStore();
  const [x, setX] = useState<Partial<CustomFoodInput>>(initial);
  const [tried, setTried] = useState(false);
  const err = customFoodError(x);
  const mismatch = x.kcal != null && (x.p || x.f || x.c) ? kcalMismatch(x.kcal, x.p || 0, x.f || 0, x.c || 0) : null;
  const save = (andAdd: boolean) => {
    setTried(true);
    if (err) return;
    const food = makeCustomFood({ ...(x as CustomFoodInput), author: session.role === 'curator' ? 'curator' : 'client' });
    // правка своего продукта сохраняет его id: на него ссылаются записи дневника
    onSave(initial.id ? { ...food, id: initial.id, createdAt: initial.createdAt || food.createdAt } : food, andAdd);
  };
  return (
    <Card title={C.ownTitle} accent={t.teal}>
      <T muted size={12}>{C.ownHint}</T>
      <Gap h={6} />
      <TextField label={C.name} value={x.name} onChange={(v) => setX({ ...x, name: v })} placeholder={C.namePlaceholder} testID="ownName" />
      <Gap h={6} />
      <Fields>
        <NumField label={C.kcal} value={x.kcal} onChange={(v) => setX({ ...x, kcal: v })} digits={0} testID="ownKcal" />
        <NumField label={C.p} value={x.p} onChange={(v) => setX({ ...x, p: v })} digits={1} testID="ownP" />
        <NumField label={C.f} value={x.f} onChange={(v) => setX({ ...x, f: v })} digits={1} testID="ownF" />
        <NumField label={C.c} value={x.c} onChange={(v) => setX({ ...x, c: v })} digits={1} testID="ownC" />
      </Fields>
      <Gap h={6} />
      <Fields>
        <NumField label={C.portionG} value={x.portion} onChange={(v) => setX({ ...x, portion: v })} digits={0} />
        <NumField label={C.pieceG} value={x.piece} onChange={(v) => setX({ ...x, piece: v })} digits={0} />
      </Fields>
      {x.barcode ? <T muted size={12}>{C.barcode + ': ' + x.barcode}</T> : null}
      {tried && err ? <Note color={t.red}>{C.errors[err]}</Note> : null}
      {mismatch != null ? <Note>{C.mismatch(mismatch)}</Note> : null}
      <Gap />
      <Row>
        <Btn kind="solid" title={C.save} onPress={() => save(true)} testID="ownSave" />
        <Btn title={C.saveOnly} onPress={() => save(false)} />
        <Btn kind="link" title={tx.common.cancel} color={t.muted} onPress={onCancel} />
      </Row>
    </Card>
  );
}

function BarcodeCard({ onFound, onMissing }: { onFound: (f: Food) => void; onMissing: (code: string) => void }) {
  const t = useTheme();
  const L = useI18n();
  const C = L.tx.catalog;
  const { data } = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const lookup = async (raw: string) => {
    const c = cleanBarcode(raw);
    setErr('');
    // уже искали — берём сохранённый, без сети
    const saved = (data.customFoods || []).find((x) => x.barcode === c);
    if (saved) return onFound(saved);
    setBusy(true);
    try {
      onFound(await fetchOffProduct(c, L.lang));
      setCode('');
    } catch (e) {
      const k = e instanceof OffError ? e.code : 'network';
      setErr(C[k]);
      if (k === 'notFound') onMissing(c);
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setErr('');
    if (!(await canDetectBarcode())) return setErr(C.noDetector);
    try {
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (r.canceled || !r.assets?.length) return;
      const found = await detectBarcode(r.assets[0].uri);
      if (!found) return setErr(C.notRead);
      setCode(found);
      lookup(found);
    } catch {
      setErr(C.notRead);
    }
  };

  return (
    <Card title={C.barcode} accent={t.violet}>
      <T muted size={12}>{C.barcodeHint}</T>
      <Gap h={6} />
      <Row gap={6} style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <TextField value={code} onChange={(v) => setCode(cleanBarcode(v))} placeholder={C.barcodePlaceholder} numeric testID="barcode" />
        </View>
        <Btn small kind="solid" title={busy ? C.finding : C.find} onPress={() => lookup(code)} disabled={busy || code.length < 8} testID="barcodeFind" />
        <Btn small title={C.scan} onPress={scan} disabled={busy} testID="barcodeScan" />
      </Row>
      {err ? <Note color={t.red}>{err}</Note> : null}
    </Card>
  );
}
