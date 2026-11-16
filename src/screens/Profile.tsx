import React, { useState } from 'react';
import { View } from 'react-native';
import { dmy, isISODate, todayISO } from '../core/dates';
import { FREQ_LABEL } from '../core/body';
import {
  applyFoodDays,
  applyWeights,
  importSummaryText,
  makeBackup,
  normDate,
  parseBackup,
  parseFatSecret,
  parseWeightHistory,
} from '../core/importers';
import type { MeasureFreq, Profile, Sex, ThemePref } from '../core/types';
import { useStore } from '../data/store';
import { cloudConfigured, linkCurator } from '../data/cloud';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { downloadText, pickTextFile } from '../ui/files';
import { kg } from '../ui/format';

export function ProfileScreen({ openHand }: { openHand: () => void }) {
  const t = useTheme();
  const st = useStore();
  const { data, session, setProfile, replaceDays, importBackup, setCurator, logout, setRole } = st;
  const p = data.profile;
  const [birth, setBirth] = useState(dmy(p.birthDate));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [code, setCode] = useState('');
  const set = (patch: Partial<Profile>) => setProfile(patch);

  const importWeights = async () => {
    const f = await pickTextFile();
    if (!f) return;
    const r = parseWeightHistory(f.text);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    const a = applyWeights(data.days, r.points);
    replaceDays(a.days);
    setMsg({ text: `История веса: добавлено ${a.added} дн.${a.kept ? `, уже было ${a.kept} (не тронуты)` : ''}`, ok: true });
  };
  const importFood = async () => {
    const f = await pickTextFile();
    if (!f) return;
    const r = parseFatSecret(f.text);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    const s = applyFoodDays(data.days, r.days, r.skipped);
    replaceDays(s.days);
    setMsg({ text: importSummaryText(s), ok: true });
  };
  const exportAll = () => {
    const b = makeBackup(session.userId, { profile: p, days: data.days, keep: data.keep, hand: data.hand, refs: data.refs });
    downloadText(`balans-backup-${todayISO()}.json`, JSON.stringify(b, null, 1));
    setMsg({ text: `Резервная копия: ${Object.keys(data.days).length} дн.`, ok: true });
  };
  const importAll = async () => {
    const f = await pickTextFile(['application/json', '*/*']);
    if (!f) return;
    const r = parseBackup(f.text, session.userId);
    if (!r.ok) return setMsg({ text: r.error, ok: false });
    importBackup(r.backup.data as never);
    setMsg({ text: `Импортировано: ${Object.keys(r.backup.data.days).length} дн. Ничего не затёрто.`, ok: true });
  };

  return (
    <View>
      <T size={22} bold>Профиль</T>
      <T muted size={13}>
        {session.mode === 'cloud' ? `Аккаунт ${session.email || ''} · данные в облаке` : session.mode === 'demo' ? 'Демо-режим' : 'Без входа · данные на этом устройстве'}
      </T>
      <Gap h={12} />

      <Card title="Пол (меняет формулы и нормы)" accent={t.amber}>
        <Seg<Sex> value={p.sex} onChange={(v) => set({ sex: v })} options={[{ v: 'male', label: 'Мужчина' }, { v: 'female', label: 'Женщина' }]} testID="sex" />
        <Gap h={6} />
        <T muted size={12}>
          {p.sex === 'male'
            ? 'БМР Миффлина +5, Кейтель для мужчин, % жира по шее и талии.'
            : 'БМР Миффлина −161, Кейтель для женщин, % жира по шее, талии и бёдрам; отметка «Цикл» в необычных днях.'}
        </T>
        <Gap />
        <Fields>
          <TextField label="Имя" value={p.name} onChange={(v) => set({ name: v })} />
          <TextField
            label="Дата рождения"
            value={birth}
            onChange={(v) => {
              setBirth(v);
              const iso = normDate(v);
              if (isISODate(iso)) set({ birthDate: iso });
            }}
            placeholder="ДД.ММ.ГГГГ"
          />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label="Рост, см" value={p.heightCm} onChange={(v) => v && set({ heightCm: v })} />
          <NumField label="Цель, кг" value={p.goalWeightKg} onChange={(v) => set({ goalWeightKg: v })} digits={1} testID="goal" />
          <NumField label="Шаги, цель" value={p.stepGoal} onChange={(v) => v && set({ stepGoal: Math.round(v) })} />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label="Белок, г на кг веса" value={p.proteinPerKg} onChange={(v) => set({ proteinPerKg: v })} digits={1} placeholder="задаёт куратор" />
        </Fields>
        <Gap h={8} />
        <T muted size={12}>Частота замеров тела</T>
        <Seg<MeasureFreq> value={p.measureFreq} onChange={(v) => set({ measureFreq: v })} options={(Object.keys(FREQ_LABEL) as MeasureFreq[]).map((k) => ({ v: k, label: FREQ_LABEL[k] }))} />
        <Gap h={8} />
        <T muted size={12}>Формула БМР</T>
        <Seg value={p.bmrFormula} onChange={(v) => set({ bmrFormula: v })} options={[{ v: 'mifflin', label: 'Миффлин — Сан Жеор' }, { v: 'lean', label: 'по сухой массе (нужен замер)' }]} />
        <Gap h={8} />
        <T muted size={12}>Как веду дневник (для пересчёта уварки в фото-подсчёте)</T>
        <Seg value={p.diaryWeights} onChange={(v) => set({ diaryWeights: v })} options={[{ v: 'raw', label: 'крупы сухими, мясо сырым' }, { v: 'cooked', label: 'в готовом виде' }]} />
      </Card>

      <Card title="Тема" accent={t.violet}>
        <Seg<ThemePref> value={p.theme} onChange={(v) => set({ theme: v })} options={[{ v: 'system', label: 'Как в системе' }, { v: 'light', label: 'Светлая' }, { v: 'dark', label: 'Тёмная' }]} testID="theme" />
      </Card>

      <Card title="Источники данных" accent={t.green}>
        <T size={13}>● FatSecret — импорт CSV (один день или период)</T>
        <T size={13}>● История веса — CSV «дата; вес» из весов, Google Fit, Excel</T>
        <T muted size={13}>○ Health Connect и Apple Health (шаги, пульс, тренировки, вес) — в мобильном приложении, этап 4</T>
        <T muted size={13}>○ Garmin, Huawei — отдельные подключения, этап 4–5</T>
        <Gap />
        <Row>
          <Btn small title="Импорт FatSecret" onPress={importFood} />
          <Btn small title="Импорт истории веса" onPress={importWeights} testID="importWeights" />
        </Row>
        <Gap h={6} />
        <Row>
          <Btn small title="Экспорт данных" onPress={exportAll} />
          <Btn small title="Импорт резервной копии" onPress={importAll} />
        </Row>
        {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
      </Card>

      <Card title="Рука для фото-подсчёта" accent={t.teal} right={<Btn small title={data.hand ? 'Изменить' : 'Замерить'} onPress={openHand} />}>
        {data.hand ? (
          <T size={13}>
            Ладонь {kg(data.hand.palmWidth)}×{kg(data.hand.palmLength)} см · кулак {kg(data.hand.fistWidth)}×{kg(data.hand.fistHeight)} см · палец {kg(data.hand.thumbLength)} см
            {data.hand.source === 'card' ? ' · проверено по карте' : ''}
          </T>
        ) : (
          <T muted size={13}>Не замерена</T>
        )}
      </Card>

      <Card title="Куратор" accent={t.blue}>
        {data.curator ? (
          <>
            <T size={14}>{data.curator.name} · видит дневник и графики с {data.curator.linkedAt.split('-').reverse().join('.')}</T>
            <Gap h={6} />
            <T muted size={12}>Что видит куратор (доступ можно отозвать в любой момент):</T>
            {(
              [
                ['food', 'питание'],
                ['workouts', 'тренировки и шаги'],
                ['measurements', 'вес и замеры'],
                ['comments', 'комментарии и самочувствие'],
                ['photos', 'фото еды (по согласию; по умолчанию нет)'],
              ] as const
            ).map(([k, label]) => (
              <Row key={k}>
                <T size={13} style={{ flex: 1 }}>{label}</T>
                <Seg
                  value={data.curator!.share[k] ? 'y' : 'n'}
                  onChange={(v) => setCurator({ ...data.curator!, share: { ...data.curator!.share, [k]: v === 'y' } })}
                  options={[{ v: 'y', label: 'да' }, { v: 'n', label: 'нет' }]}
                />
              </Row>
            ))}
            <Gap h={6} />
            <Btn small title="Отключить куратора" color={t.red} onPress={() => setCurator(undefined)} />
          </>
        ) : (
          <>
            <T muted size={13}>Введите код приглашения от куратора — он увидит ваш дневник, тренды и отчёты.</T>
            <Gap h={6} />
            <Fields>
              <TextField value={code} onChange={setCode} placeholder="Код, например FIT-2048" testID="curatorCode" />
              <Btn
                small
                title="Подключить"
                disabled={code.trim().length < 4}
                onPress={async () => {
                  let name = 'Куратор';
                  if (session.mode === 'cloud') {
                    try {
                      name = await linkCurator(code);
                    } catch (e) {
                      return setMsg({ text: (e as Error).message, ok: false });
                    }
                  } else name = 'Ирина М. (демо)';
                  setCurator({ name, code: code.trim().toUpperCase(), linkedAt: todayISO(), share: { food: true, workouts: true, measurements: true, comments: true, photos: false } });
                }}
              />
            </Fields>
          </>
        )}
      </Card>

      <Card title="Тариф" accent={t.amber}>
        <Seg value={p.plan} onChange={(v) => set({ plan: v })} options={[{ v: 'free', label: 'Бесплатный' }, { v: 'premium', label: 'Премиум' }]} />
        <T muted size={12}>Оплата подключается позже (ЮKassa / RuStore в РФ, магазины или Stripe/Paddle вне РФ). Сейчас переключатель — для пилота.</T>
      </Card>

      <Card title="Аккаунт и данные" accent={t.muted}>
        {!cloudConfigured() ? <T muted size={13}>Сервер ещё не подключён: вход через Google и синхронизация между устройствами заработают после настройки Supabase (см. README).</T> : null}
        <T muted size={12}>Согласие на обработку данных о здоровье: {data.consent.health ? dmy(data.consent.health) : 'не дано'}. Фото: {data.consent.photoAI ? dmy(data.consent.photoAI) : 'не дано'}.</T>
        <T muted size={12}>Оценки по формулам и тренду веса — ориентир, не медицинская рекомендация.</T>
        <Divider />
        <Row>
          <Btn small title="Открыть кабинет куратора" onPress={() => setRole('curator')} testID="toCurator" />
          <Btn small title={session.mode === 'demo' ? 'Выйти из демо' : 'Выйти'} color={t.red} onPress={logout} />
        </Row>
      </Card>
    </View>
  );
}
