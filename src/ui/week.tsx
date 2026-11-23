// Тренировки недели Пн–Вс в карточке «Тренировка» (вариант Б): счётчик в заголовке, 7 ячеек, полоска и подсказка.
// Силовая — квадратная ячейка «С», кардио — круглая «К»: различаются буквой и формой, не только цветом.

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ISODate } from '../core/dates';
import { parseISO } from '../core/dates';
import type { WeekWorkouts } from '../core/workouts';
import { useI18n } from '../i18n';
import { Bar, T } from './kit';
import { useFs, useTheme } from './theme';
import { useStore } from '../data/store';

export function WeekCount({ w }: { w: WeekWorkouts }) {
  const t = useTheme();
  const { tx } = useI18n();
  const W = tx.day.workout.week;
  const large = useStore().data.profile.textSize === 'large';
  const ok = w.done >= w.goal;
  return (
    <T bold size={12} color={ok ? t.green : t.text} testID="weekCount">
      {(large ? W.count : W.countWide)(w.done, w.goal) + (ok ? ' ✓' : '')}
    </T>
  );
}

export function WeekStrip({ w, sel, curator, onPick }: { w: WeekWorkouts; sel: ISODate; curator: boolean; onPick: (d: ISODate) => void }) {
  const t = useTheme();
  const fs = useFs();
  const { tx } = useI18n();
  const W = tx.day.workout.week;
  const names = tx.day.calendar.weekdaysShort;
  const h = w.hint;
  const status =
    h.kind === 'done'
      ? W.done
      : h.kind === 'doneNeedStrength'
        ? W.doneNeedStrength(h.strengthLeft)
        : h.kind === 'missed'
          ? W.missed(w.done, w.goal)
          : W.left(h.left, h.strengthLeft);
  const lead = curator ? W.goalOnly(w.goal) : W.recommend(w.goal);
  const ok = w.done >= w.goal;
  return (
    <View testID="weekStrip">
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {w.days.map((d) => {
          const wd = names[parseISO(d.date).getDay()];
          const label = wd.charAt(0).toUpperCase() + wd.slice(1);
          const on = d.date === sel;
          const c = d.kind === 'strength' ? t.amber : d.kind === 'cardio' ? t.blue : t.line;
          return (
            <Pressable
              key={d.date}
              disabled={d.future}
              onPress={() => onPick(d.date)}
              accessibilityRole="button"
              accessibilityLabel={W.a11y(label, d.kind)}
              style={{ flex: 1, alignItems: 'center', gap: 3 }}
              testID={'week-' + d.date}
            >
              <View
                style={{
                  alignSelf: 'stretch',
                  height: fs(26),
                  borderRadius: d.kind === 'cardio' ? fs(13) : d.kind === 'strength' ? 4 : 8,
                  borderWidth: on ? 2 : 1,
                  borderStyle: d.future ? 'dashed' : 'solid',
                  borderColor: on ? t.text : c,
                  backgroundColor: d.kind ? c + '22' : d.future ? 'transparent' : t.input,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {d.kind ? <Text style={{ color: c, fontWeight: '800', fontSize: fs(11) }}>{W.letter[d.kind]}</Text> : null}
              </View>
              <Text style={{ color: on ? t.text : t.muted, fontWeight: on ? '700' : '400', fontSize: fs(11) }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 6 }} />
      <Bar value={w.done / w.goal} color={ok ? t.green : t.progress} />
      <T muted size={12} style={{ marginTop: 6 }} testID="weekHint">
        {`${lead} ${status}`}
      </T>
    </View>
  );
}
