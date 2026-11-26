// Простой режим: данные общие с обычным дневником, но ввод в коротких диалогах.
// При отмене ничего не записываем. Не создаём отдельный источник данных.
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { shiftDate, todayISO, type ISODate } from '../core/dates';
import type { DayEntry, MealSlot } from '../core/types';
import { applyFoodDays } from '../core/importers';
import { kcalMismatch, macroKcal } from '../core/energy';
import { Chart } from '../ui/Chart';
import { importFatSecretFile } from '../ui/fatsecret';
import { importSummaryText } from '../ui/format';
import { errorText } from '../i18n';
import { useStore } from '../data/store';
import { Btn, Card, Gap, NumField, Row, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';
import { layoutColumns } from '../ui/layout';

type Section = 'weight' | 'food' | 'activity' | 'feeling';
type Draft = Pick<DayEntry, 'weight' | 'kcal' | 'protein' | 'fat' | 'carbs' | 'steps' | 'workoutMin' | 'wellbeing' | 'comment'>;

export function ChillDay({ sel, setSel, openFood, openPhoto, openCharts }: {
  sel: ISODate;
  setSel: (day: ISODate) => void;
  openFood?: () => void;
  openPhoto?: (meal?: MealSlot) => void;
  openCharts?: () => void;
}) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const C = tx.chill;
  const { data, setDay, replaceDays } = useStore();
  const width = useWindowDimensions().width;
  const columns = layoutColumns(width, data.profile.layoutMode);
  const e = data.days[sel] || {};
  const savedMismatch = kcalMismatch(e);
  const from = shiftDate(sel, -13);
  const days14 = Array.from({ length: 14 }, (_, i) => shiftDate(from, i));
  const weightPoints = days14.filter((day) => data.days[day]?.weight != null).map((day) => ({ d: day, v: data.days[day].weight! }));
  const intakePoints = days14.filter((day) => data.days[day]?.kcal != null || macroKcal(data.days[day]?.protein, data.days[day]?.fat, data.days[day]?.carbs) != null).map((day) => ({ d: day, v: data.days[day]?.kcal ?? Math.round(macroKcal(data.days[day]?.protein, data.days[day]?.fat, data.days[day]?.carbs)!) }));
  const [active, setActive] = useState<Section | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState('');
  const draftMismatch = kcalMismatch({ ...draft, kcalManual: draft.kcal != null });
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  // Точно тот же механизм FatSecret, что в обычном дневнике.
  const importCsv = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importFatSecretFile();
      if (!result) return;
      if (!result.ok) return setImportMsg({ text: errorText(L, result.error), ok: false });
      const merged = applyFoodDays(data.days, result.days, result.skipped);
      replaceDays(merged.days);
      setImportMsg({ text: importSummaryText(L, merged), ok: true });
      if (result.days.length === 1 && result.days[0].date !== sel) setSel(result.days[0].date);
    } catch {
      setImportMsg({ text: C.importFailed, ok: false });
    } finally {
      setImporting(false);
    }
  };

  const open = (section: Section) => {
    setDraft({
      weight: e.weight, kcal: e.kcal, protein: e.protein, fat: e.fat, carbs: e.carbs,
      steps: e.steps, workoutMin: e.workoutMin, wellbeing: e.wellbeing, comment: e.comment,
    });
    setError('');
    setActive(section);
  };
  const set = (patch: Partial<Draft>) => setDraft((old) => ({ ...old, ...patch }));
  const save = () => {
    if (!active) return;
    let patch: Partial<DayEntry>;
    if (active === 'weight') {
      if (draft.weight != null && (draft.weight < 20 || draft.weight > 400)) return setError(C.invalidWeight);
      patch = { weight: draft.weight };
    } else if (active === 'food') {
      if ([draft.kcal, draft.protein, draft.fat, draft.carbs].some((v) => v != null && (v < 0 || v > 12000))) return setError(C.invalidValue);
      patch = { kcal: draft.kcal, kcalManual: draft.kcal != null, protein: draft.protein, fat: draft.fat, carbs: draft.carbs };
    } else if (active === 'activity') {
      if (draft.steps != null && (draft.steps < 0 || draft.steps > 200000)) return setError(C.invalidValue);
      if (draft.workoutMin != null && (draft.workoutMin < 0 || draft.workoutMin > 1440)) return setError(C.invalidValue);
      patch = { steps: draft.steps, workoutMin: draft.workoutMin };
    } else {
      if (draft.wellbeing != null && (!Number.isInteger(draft.wellbeing) || draft.wellbeing < 1 || draft.wellbeing > 10)) return setError(C.invalidFeeling);
      patch = { wellbeing: draft.wellbeing, comment: draft.comment };
    }
    setDay(sel, patch);
    setActive(null);
  };
  const sections: { id: Section; icon: string; title: string; value: string; accent: string }[] = [
    { id: 'weight', icon: '⚖', title: C.weight, value: e.weight == null ? C.add : f.num(e.weight, 2) + ' ' + tx.common.kg, accent: t.blue },
    { id: 'food', icon: '◉', title: C.food, value: e.kcal == null && macroKcal(e.protein, e.fat, e.carbs) == null ? C.add : f.int(e.kcal ?? Math.round(macroKcal(e.protein, e.fat, e.carbs)!)) + ' ' + tx.common.kcal, accent: t.amber },
    { id: 'activity', icon: '↗', title: C.activity, value: e.steps == null ? C.add : f.int(e.steps) + ' ' + C.steps, accent: t.green },
    { id: 'feeling', icon: '♡', title: C.feeling, value: e.wellbeing == null ? C.add : e.wellbeing + '/10', accent: t.violet },
  ];
  return (
    <View testID="chillDay">
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <T muted size={12} style={{ letterSpacing: 1 }}>{C.title}</T>
          <T size={24} bold>{f.longDate(sel)}</T>
        </View>
        <Row gap={5}>
          <Btn small title="‹" onPress={() => setSel(shiftDate(sel, -1))} testID="chillPrevDay" />
          {sel !== todayISO() ? <Btn small title={tx.common.today} onPress={() => setSel(todayISO())} /> : null}
          <Btn small title="›" onPress={() => setSel(shiftDate(sel, 1))} disabled={sel >= todayISO()} testID="chillNextDay" />
        </Row>
      </Row>
      <Card accent={t.teal}>
        <T bold size={20}>{C.welcome}</T>
        <Gap h={4} />
        <T muted>{C.subtitle}</T>
      </Card>
      <Gap h={10} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {sections.map((section) => (
          <Pressable
            key={section.id}
            accessibilityRole="button"
            accessibilityLabel={section.title}
            testID={'chill-' + section.id}
            onPress={() => open(section.id)}
            style={{ backgroundColor: t.card, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 16, minWidth: columns === 2 ? 260 : 0, width: columns === 2 ? '48%' : '100%', flexGrow: 1, minHeight: 118, padding: 16, justifyContent: 'space-between' }}
          >
            <Row gap={8}>
              <T size={25} color={section.accent}>{section.icon}</T>
              <T bold size={16}>{section.title}</T>
            </Row>
            <T size={14} color={section.value === C.add ? t.muted : t.text}>{section.value}</T>
            <T muted size={12}>{C.tap}</T>
          </Pressable>
        ))}
      </View>
      {savedMismatch ? (
        <Card title={C.mismatchTitle} accent={t.amber}>
          <T color={t.amber} testID="chillKcalMismatch">{tx.day.food.mismatch(f.int(savedMismatch.kcal), f.int(savedMismatch.macro), (savedMismatch.diff > 0 ? '+' : '−') + f.int(Math.abs(savedMismatch.diff)))}</T>
          <Gap h={6} />
          <Btn small title={tx.day.food.recalc(f.int(savedMismatch.macro))} onPress={() => setDay(sel, { kcal: undefined, kcalManual: undefined })} testID="chillKcalRecalc" />
        </Card>
      ) : null}
      <Gap h={12} />
      <Card title={C.trendsTitle} accent={t.teal}>
        <T muted size={12}>{C.trendsHint}</T>
        <Gap h={8} />
        <View style={{ flexDirection: columns === 2 ? 'row' : 'column', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flex: 1, minWidth: columns === 2 ? 260 : 0 }}>
            <T size={13} bold>{C.weightTrend}</T>
            {weightPoints.length > 0 ? <Chart height={155} spec={{ title: C.weightTrend, from, to: sel, series: [{ label: C.weightTrend, color: t.blue, dots: true, points: weightPoints }] }} /> : <T muted>{C.noWeightTrend}</T>}
          </View>
          <View style={{ flex: 1, minWidth: columns === 2 ? 260 : 0 }}>
            <T size={13} bold>{C.foodTrend}</T>
            {intakePoints.length > 0 ? <Chart height={155} spec={{ title: C.foodTrend, from, to: sel, series: [{ label: C.foodTrend, color: t.amber, bars: true, points: intakePoints }] }} /> : <T muted>{C.noFoodTrend}</T>}
          </View>
        </View>
        {openCharts ? <Btn title={C.allCharts} onPress={openCharts} testID="chillAllCharts" /> : null}
      </Card>
      <Gap h={12} />
      <Card title={C.otherWays} accent={t.blue}>
          <Row gap={8}>
            <Btn title={importing ? C.importing : C.importFs} onPress={importCsv} disabled={importing} testID="chillImportFs" />
            {openFood ? <Btn title={C.foodCatalog} onPress={openFood} /> : null}
            {openPhoto ? <Btn title={C.photo} onPress={() => openPhoto()} /> : null}
          </Row>
          {importMsg ? <T size={12} color={importMsg.ok ? t.green : t.red} testID="chillImportResult">{importMsg.text}</T> : null}
        </Card>
      <T muted size={12} style={{ marginTop: 10 }}>{C.safeNote}</T>
      <Modal visible={active !== null} transparent animationType="fade" onRequestClose={() => setActive(null)}>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#000000AA', paddingHorizontal: 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 30 }}>
            <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
              <T size={21} bold>{active ? sections.find((s) => s.id === active)?.title : ''}</T>
              <Gap h={12} />
              {active === 'weight' ? <NumField label={C.weightKg} value={draft.weight} digits={2} onChange={(v) => set({ weight: v })} testID="chillWeightInput" /> : null}
              {active === 'food' ? (
                <>
                  <Btn title={importing ? C.importing : C.importFs} onPress={importCsv} disabled={importing} testID="chillImportFsDialog" />
                  {importMsg ? <T size={12} color={importMsg.ok ? t.green : t.red}>{importMsg.text}</T> : null}
                  <Gap h={10} />
                  <NumField label={C.calories} value={draft.kcal} digits={0} onChange={(v) => set({ kcal: v })} testID="chillKcalInput" />
                  <Gap h={8} />
                  <NumField label={C.protein} value={draft.protein} digits={1} onChange={(v) => set({ protein: v })} />
                  <Gap h={8} />
                  <NumField label={C.fat} value={draft.fat} digits={1} onChange={(v) => set({ fat: v })} />
                  <Gap h={8} />
                  <NumField label={C.carbs} value={draft.carbs} digits={1} onChange={(v) => set({ carbs: v })} />
                  <T muted size={12}>{C.foodNote}</T>
                  {draftMismatch ? (
                    <View style={{ borderColor: t.amber, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 }} testID="chillDraftKcalMismatch">
                      <T color={t.amber}>{tx.day.food.mismatch(f.int(draftMismatch.kcal), f.int(draftMismatch.macro), (draftMismatch.diff > 0 ? '+' : '−') + f.int(Math.abs(draftMismatch.diff)))}</T>
                      <Gap h={6} />
                      <Btn small title={tx.day.food.recalc(f.int(draftMismatch.macro))} onPress={() => set({ kcal: undefined })} testID="chillDraftKcalRecalc" />
                    </View>
                  ) : null}
                </>
              ) : null}
              {active === 'activity' ? (
                <>
                  <NumField label={C.steps} value={draft.steps} digits={0} onChange={(v) => set({ steps: v })} testID="chillStepsInput" />
                  <Gap h={8} />
                  <NumField label={C.workout} value={draft.workoutMin} digits={0} onChange={(v) => set({ workoutMin: v })} />
                </>
              ) : null}
              {active === 'feeling' ? (
                <>
                  <NumField label={C.feelingScore} value={draft.wellbeing} digits={0} onChange={(v) => set({ wellbeing: v })} testID="chillFeelingInput" />
                  <Gap h={8} />
                  <TextField label={C.comment} value={draft.comment} onChange={(v) => set({ comment: v })} multiline />
                </>
              ) : null}
              {error ? <T color={t.red} size={12}>{error}</T> : null}
              <Gap h={16} />
              <Row gap={8}>
                <Btn kind="solid" title={C.save} onPress={save} testID="chillSave" />
                <Btn title={C.cancel} onPress={() => setActive(null)} testID="chillCancel" />
              </Row>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
