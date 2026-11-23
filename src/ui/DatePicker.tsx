// Календарь для перехода к любому дню дневника. Будущие дни (после today) недоступны,
// дни с записями помечены точкой. Даты — строки ГГГГ-ММ-ДД по местному времени (без toISOString).

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { monthCells, parseISO, type ISODate } from '../core/dates';
import { monthDates, monthSummary, scoreDays } from '../core/dayscore';
import type { DayMap, KeepMap, Profile } from '../core/types';
import { scoreColor, VERDICT_ICON } from './score';
import { useI18n } from '../i18n';
import { useFs, useTheme } from './theme';

/** Иконка календаря для кнопки рядом со стрелками. */
export function CalendarIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x={1.75} y={3} width={12.5} height={11.25} rx={2} stroke={color} strokeWidth={1.5} />
      <Line x1={1.75} y1={6.75} x2={14.25} y2={6.75} stroke={color} strokeWidth={1.5} />
      <Line x1={5} y1={1.25} x2={5} y2={4.25} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={11} y1={1.25} x2={11} y2={4.25} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

export function DatePicker({
  visible,
  value,
  max,
  marked,
  scores,
  onPick,
  onClose,
}: {
  /** Данные для значков итога дня (✓ ≈ ▲ ▼ • ◷); без них — точки «есть записи». */
  scores?: { profile: Profile; days: DayMap; keep: KeepMap };
  visible: boolean;
  value: ISODate;
  /** Последний доступный день (сегодня). */
  max: ISODate;
  /** Есть ли записи в этот день. */
  marked: (d: ISODate) => boolean;
  onPick: (d: ISODate) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const fs = useFs();
  const { tx } = useI18n();
  const C = tx.day.calendar;
  const [ym, setYm] = useState(() => {
    const d = parseISO(value);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  useEffect(() => {
    if (!visible) return;
    const d = parseISO(value);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  }, [visible, value]);

  const maxD = parseISO(max);
  const atMax = ym.y > maxD.getFullYear() || (ym.y === maxD.getFullYear() && ym.m >= maxD.getMonth());
  const cells = useMemo(() => monthCells(ym.y, ym.m, C.weekStart), [ym, C.weekStart]);
  // итоги дней месяца считаются только пока календарь открыт
  const sc = useMemo(
    () => (visible && scores ? scoreDays(scores.profile, scores.days, scores.keep, monthDates(ym.y, ym.m)) : null),
    [visible, scores?.profile, scores?.days, scores?.keep, ym], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const anyScore = !!sc && Object.values(sc).some((x) => x);
  const sum = sc ? monthSummary(sc) : null;
  const heads = [...Array(7)].map((_, i) => C.weekdaysShort[(i + C.weekStart) % 7]);
  const step = (k: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + k) / 12), m: (((m + k) % 12) + 12) % 12 }));
  const pick = (d: ISODate) => {
    onPick(d);
    onClose();
  };

  const navBtn = (label: string, onPress: () => void, disabled: boolean, testID: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.input,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: t.text, fontSize: fs(18), fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {/* нажатия внутри карточки не закрывают окно */}
        <Pressable
          onPress={() => {}}
          testID="calendar"
          style={{ width: '100%', maxWidth: 360, backgroundColor: t.card, borderRadius: 18, borderWidth: 1, borderColor: t.cardBorder, padding: 16 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            {navBtn('‹', () => step(-1), false, 'calPrev')}
            <Text style={{ color: t.text, fontSize: fs(17), fontWeight: '700' }}>
              {C.months[ym.m]} {ym.y}
            </Text>
            {navBtn('›', () => step(1), atMax, 'calNext')}
          </View>

          {anyScore && sum ? (
            <Text testID="calSummary" style={{ color: t.muted, fontSize: fs(12), marginBottom: 8 }}>
              {C.summary(sum.ok, sum.total, sum.over, sum.under)}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            {heads.map((h, i) => (
              <Text key={i} style={{ width: `${100 / 7}%`, textAlign: 'center', color: t.muted, fontSize: fs(12), paddingBottom: 6 }}>
                {h}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={{ width: `${100 / 7}%`, height: 42 }} />;
              const future = d > max;
              const sel = d === value;
              const today = d === max;
              const has = !future && marked(d);
              const ds = sc?.[d];
              // итог дня: значок с цветом; день без калорий — серая точка, сегодня — ◷
              const icon = ds && (ds.verdict !== 'noData' || has) ? VERDICT_ICON[ds.verdict] : null;
              const iconColor = ds ? (ds.verdict === 'open' || ds.verdict === 'noData' ? t.muted : ds.verdict === 'ok' ? t.green : scoreColor(t, ds.tone)) : t.muted;
              return (
                <View key={i} style={{ width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID={`cal-${d}`}
                    disabled={future}
                    onPress={() => pick(d)}
                    style={({ pressed }) => ({
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: sel ? t.amber : 'transparent',
                      borderWidth: today && !sel ? 1.5 : 0,
                      borderColor: t.amber,
                      opacity: future ? 0.3 : pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ color: sel ? t.onAccent : t.text, fontSize: fs(15), fontWeight: sel || today ? '700' : '400', marginBottom: icon ? 9 : 0 }}>
                      {Number(d.slice(8))}
                    </Text>
                    {icon ? (
                      <Text style={{ position: 'absolute', bottom: 0, fontSize: fs(12), lineHeight: fs(13), fontWeight: '800', color: sel ? t.onAccent : iconColor }}>{icon}</Text>
                    ) : has ? (
                      <View
                        style={{ position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: sel ? t.onAccent : t.green }}
                      />
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            {anyScore ? (
              <Text style={{ color: t.muted, fontSize: fs(11), flexShrink: 1, marginRight: 8 }}>{C.legendScore}</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.green }} />
                <Text style={{ color: t.muted, fontSize: fs(12) }}>{C.legend}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Pressable onPress={() => pick(max)} hitSlop={6} testID="calToday">
                <Text style={{ color: t.amber, fontWeight: '600', fontSize: fs(14) }}>{tx.common.today}</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={6} testID="calClose">
                <Text style={{ color: t.muted, fontWeight: '600', fontSize: fs(14) }}>{tx.common.cancel}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
