// Состояние приложения: локальная рабочая копия + синхронизация с облаком.
// Правила синхронизации из прототипа: флаг неотправленных изменений; без флага облако главнее;
// с флагом — объединение, где заполненные локальные поля побеждают; пустое не затирает заполненное.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { addMonthsClamped, todayISO, type ISODate } from '../core/dates';
import { compactEntry, mergeDays, mergeEntry } from '../core/merge';
import { DEFAULT_PROFILE, type DayEntry, type DayMap, type KeepMap, type Plan, type Profile } from '../core/types';
import type { HandProfile } from '../core/photo/estimate';
import { addPhotoMeal, editsFromMeal, removePhotoMeal, type PhotoEdit } from '../core/photo/meals';
import type { PhotoMeal } from '../core/types';
import { withGoal, type GoalProposal, type GoalSetting } from '../core/targets';
import { demoCuratorAccount, demoDays, demoProfile, type DemoLabels } from '../core/demo';
import {
  addReferral,
  checkCode,
  codeFromUrl,
  makeCode,
  makeOffer,
  markPaid,
  normalizeCode,
  offerOpen,
  setReferralStatus,
  type CodeError,
  type CuratorAccount,
  type CuratorPlan,
  type ReferralOffer,
} from '../core/promo';
import { load, save, clearAll } from './storage';
import {
  clientEndLink,
  currentUser,
  linkCurator,
  myGoalProposals,
  myReferralOffer,
  savePhotoEstimate,
  recordConsents,
  respondGoalProposal,
  supabase,
  supabaseRepo,
  signOut,
  type CloudRepo,
} from './cloud';
import { LEGAL_VERSION } from '../legal';

export type Mode = 'none' | 'local' | 'demo' | 'cloud';
export type Role = 'client' | 'curator';

export interface Session {
  mode: Mode;
  userId: string;
  email?: string;
  role: Role;
}

export interface CuratorAccess {
  name: string;
  code: string;
  linkedAt: ISODate;
  share: { food: boolean; workouts: boolean; measurements: boolean; comments: boolean; photos: boolean };
  /** Премиум бесплатно, пока идёт ведение (платит куратор своим тарифом). Нет поля у старых связей — тоже да. */
  premium?: boolean;
}

/** Доступ, который клиент даёт куратору по умолчанию (фото еды — только по отдельному согласию). */
export const DEFAULT_SHARE: CuratorAccess['share'] = { food: true, workouts: true, measurements: true, comments: true, photos: false };

/** id пользователя этого устройства в списке клиентов локального кабинета куратора. */
export const SELF_ID = 'self';

export interface FoodRef {
  id: string;
  date: ISODate;
  name: string;
  /** Реальный вес, г. */
  grams: number;
  kcal: number;
  /** Оценка по фото до взвешивания, г — для ошибки в %. */
  estGrams?: number;
}

/** Даты (ГГГГ-ММ-ДД), когда пользователь отметил галочку; нет поля — не отмечено. */
export interface Consent {
  health?: string; // согласие на обработку ПДн, включая данные о здоровье (152-ФЗ ст. 9–10 / GDPR ст. 9)
  photoAI?: string; // отдельное согласие на обработку фото
  terms?: string; // принял пользовательское соглашение
  privacy?: string; // ознакомлен с политикой конфиденциальности
  marketing?: string; // необязательное согласие на рассылки (38-ФЗ ст. 18)
  /** Версия комплекта документов, которую принял пользователь (LEGAL_VERSION). */
  version?: string;
}

export interface AppData {
  profile: Profile;
  days: DayMap;
  keep: KeepMap;
  hand?: HandProfile;
  refs: FoodRef[];
  photoUsage: ISODate[];
  /** Правки граммов после оценки ИИ (последние 300) — для будущей калибровки оценки. */
  photoEdits?: PhotoEdit[];
  curator?: CuratorAccess;
  consent: Consent;
  /** Предложения куратора по режиму цели, ждущие подтверждения. */
  goalProposals?: GoalProposal[];
  /** Кабинет куратора на этом устройстве (без сервера и в демо): код, тариф, кто пришёл по коду. */
  curatorAccount?: CuratorAccount;
  /** Последний выданный сквозной номер кода на этом устройстве (на сервере — последовательность). */
  promoSeq?: number;
  /** Предложение Премиума со скидкой после окончания ведения. */
  offer?: ReferralOffer;
  /** Код из ссылки-приглашения — подставляется в анкету и профиль. */
  invite?: string;
  /** Когда последний раз сохраняли резервную копию (мс) — для напоминания на «Дне». */
  lastBackupAt?: number;
}

const EMPTY: AppData = { profile: DEFAULT_PROFILE, days: {}, keep: {}, refs: [], photoUsage: [], consent: {} };

/**
 * Состояние синхронизации: код + время (ЧЧ:ММ). Текст подставляет интерфейс из словаря sync.*,
 * чтобы статус переводился вместе с языком.
 */
export type SyncCode = 'local' | 'demo' | 'noServer' | 'saving' | 'connecting' | 'saved' | 'synced' | 'offlineSaved' | 'offlinePull';
export interface SyncStatus {
  kind: 'off' | 'busy' | 'ok' | 'offline';
  code: SyncCode;
  /** Время последнего успешного обмена, ЧЧ:ММ. */
  at?: string;
}

interface StoreApi {
  ready: boolean;
  session: Session;
  data: AppData;
  sync: SyncStatus;
  /** Действующий тариф: на ведении у куратора — Премиум, иначе выбранный в профиле. */
  plan: Plan;
  setDay: (date: ISODate, patch: Partial<DayEntry>) => void;
  clearDay: (date: ISODate) => void;
  replaceDays: (days: DayMap) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setKeep: (date: ISODate, keep: boolean) => void;
  setHand: (h: HandProfile) => void;
  addRef: (r: FoodRef) => void;
  removeRef: (id: string) => void;
  logPhoto: (d: ISODate) => void;
  /** Подтвердить приём по фото: прибавить к дню и сохранить правки граммов. */
  addMeal: (date: ISODate, m: PhotoMeal) => void;
  removeMeal: (date: ISODate, id: string) => void;
  setCurator: (c: CuratorAccess | undefined) => void;
  /** Клиент вводит код куратора. Возвращает ошибку или null, если привязка прошла. */
  linkByCode: (code: string, selfName: string) => Promise<CodeError | null>;
  /** Клиент сам отключает куратора: ведение закончилось, появляется предложение со скидкой. */
  unlinkCurator: () => void;
  /** Оформить Премиум со скидкой (оплата пока не подключена — отметка для пилота). */
  acceptOffer: () => void;
  dismissOffer: () => void;
  setInvite: (code: string | undefined) => void;
  /** Куратор (без сервера): создать код по фамилии. */
  createCuratorAccount: (surname: string, displayName: string) => void;
  setCuratorPlan: (p: CuratorPlan) => void;
  /** Куратор завершает ведение (ended) или отвязывает клиента (removed). */
  endReferral: (id: string, how: 'ended' | 'removed') => void;
  setConsent: (c: Consent) => void;
  /** Резервная копия сохранена: запомнить время (напоминание пропадает). */
  markBackup: () => void;
  /** Новый режим цели с сегодняшнего дня (правка в тот же день заменяет режим дня). */
  setGoal: (g: Omit<GoalSetting, 'start'>) => void;
  /** «Пересчитать сейчас»: планка считается заново по данным на сегодня. */
  recalcGoal: () => void;
  answerProposal: (id: string, accept: boolean) => Promise<void>;
  startLocal: (role: Role) => void;
  startDemo: (role: Role, labels?: DemoLabels) => void;
  startCloud: () => Promise<void>;
  setRole: (r: Role) => void;
  logout: () => Promise<void>;
  importBackup: (incoming: Partial<AppData>) => void;
}

const Ctx = createContext<StoreApi | null>(null);

const hhmm = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>({ mode: 'none', userId: '', role: 'client' });
  const [data, setData] = useState<AppData>(EMPTY);
  const [sync, setSync] = useState<SyncStatus>({ kind: 'off', code: 'local' });
  const repo = useRef<CloudRepo | null>(null);
  const pendingDays = useRef<Set<ISODate>>(new Set());
  const pendingProfile = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  // ---- загрузка ----
  useEffect(() => {
    (async () => {
      const sess = await load<Session>('session', { mode: 'none', userId: '', role: 'client' });
      const d = await load<AppData>('data', EMPTY);
      const pend = await load<{ days: ISODate[]; profile: boolean }>('sync_pending', { days: [], profile: false });
      pendingDays.current = new Set(pend.days);
      pendingProfile.current = pend.profile;
      // у тех, кто вёл дневник до появления анкеты, она считается пройденной
      const had = !!d.profile && Object.keys(d.days || {}).length > 0;
      setData({ ...EMPTY, ...d, profile: { ...DEFAULT_PROFILE, ...(had ? { onboarded: true } : {}), ...d.profile } });
      // возврат после входа через Google/Apple (веб)
      let s = sess;
      if (supabase()) {
        const u = await currentUser().catch(() => null);
        if (u && (s.mode === 'none' || s.mode === 'cloud')) s = { mode: 'cloud', userId: u.id, email: u.email, role: s.role };
        else if (!u && s.mode === 'cloud') s = { mode: 'none', userId: '', role: s.role };
      }
      setSession(s);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (ready) save('session', session);
  }, [session, ready]);

  // ---- код из ссылки-приглашения (#/invite/КОД) ----
  useEffect(() => {
    if (!ready || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const take = () => {
      const c = codeFromUrl(window.location.href);
      if (!c) return;
      setData((cur) => ({ ...cur, invite: c }));
      history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&]code=[^&]*/i, ''));
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, [ready]);

  // ---- журнал согласий на сервере (галочки входа, рассылки, фото) ----
  const consentSent = useRef('');
  useEffect(() => {
    if (!ready || session.mode !== 'cloud') return;
    const c = data.consent;
    const key = session.userId + JSON.stringify(c);
    if (consentSent.current === key) return;
    consentSent.current = key;
    recordConsents(
      { terms: c.terms, privacy: c.privacy, health: c.health, marketing: c.marketing, photo_ai: c.photoAI },
      c.version || LEGAL_VERSION,
    ).catch(() => {
      consentSent.current = ''; // повторим при следующем изменении
    });
  }, [ready, session.mode, session.userId, data.consent]);

  // ---- сохранение локально ----
  useEffect(() => {
    if (!ready || session.mode === 'none') return;
    const id = setTimeout(() => save('data', data), 250);
    return () => clearTimeout(id);
  }, [data, ready, session.mode]);

  const persistPending = () =>
    save('sync_pending', { days: [...pendingDays.current], profile: pendingProfile.current });

  // ---- облако ----
  const pushNow = useCallback(async () => {
    const r = repo.current;
    if (!r) return;
    if (!pendingDays.current.size && !pendingProfile.current) return;
    setSync({ kind: 'busy', code: 'saving' });
    const dates = [...pendingDays.current];
    const changes: Record<ISODate, DayEntry | null> = {};
    for (const d of dates) {
      const e = dataRef.current.days[d];
      changes[d] = e && Object.keys(compactEntry(e)).length ? e : null;
    }
    try {
      if (dates.length) await r.pushDays(changes);
      if (pendingProfile.current) await r.pushProfile(dataRef.current.profile, dataRef.current.keep);
      dates.forEach((d) => pendingDays.current.delete(d));
      pendingProfile.current = false;
      persistPending();
      setSync({ kind: 'ok', code: 'saved', at: hhmm() });
    } catch {
      setSync({ kind: 'offline', code: 'offlineSaved' });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(pushNow, 30000);
    }
  }, []);

  const schedulePush = useCallback(() => {
    persistPending();
    if (!repo.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(pushNow, 1500);
  }, [pushNow]);

  const pull = useCallback(async () => {
    const r = repo.current;
    if (!r) return;
    setSync({ kind: 'busy', code: 'connecting' });
    try {
      const snap = await r.pull();
      setData((cur) => {
        const pending = pendingDays.current.size > 0 || pendingProfile.current;
        let days: DayMap;
        if (!pending) {
          days = snap.days;
          // устройство с историей, а облако пустое — отправить историю в облако
          if (!Object.keys(snap.days).length && Object.keys(cur.days).length) {
            Object.keys(cur.days).forEach((d) => pendingDays.current.add(d));
            pendingProfile.current = true;
            days = cur.days;
          }
        } else {
          days = { ...snap.days };
          for (const d of Object.keys(cur.days)) days[d] = mergeEntry(snap.days[d], cur.days[d]);
          // день, очищенный локально и ждущий отправки, не воскрешаем
          for (const d of pendingDays.current) if (!cur.days[d]) delete days[d];
        }
        let profile = pendingProfile.current || !snap.profile ? cur.profile : { ...DEFAULT_PROFILE, ...snap.profile };
        // аккаунт с историей в облаке — анкету уже не спрашиваем
        if (profile.onboarded == null && Object.keys(snap.days).length) profile = { ...profile, onboarded: true };
        const keep = pendingProfile.current || !snap.keep ? cur.keep : snap.keep;
        if (!snap.profile) pendingProfile.current = true;
        return { ...cur, days, profile, keep };
      });
      setSync({ kind: 'ok', code: 'synced', at: hhmm() });
      schedulePush();
      // предложения куратора по цели (таблица из миграции 0003; нет таблицы — просто пропускаем)
      myGoalProposals()
        .then((goalProposals) => setData((cur) => ({ ...cur, goalProposals })))
        .catch(() => {});
      // предложение со скидкой после ведения (миграция 0004; нет таблицы — пропускаем)
      myReferralOffer()
        .then((offer) => offer && setData((cur) => ({ ...cur, offer: cur.offer?.acceptedAt ? cur.offer : offer })))
        .catch(() => {});
    } catch {
      setSync({ kind: 'offline', code: 'offlinePull' });
    }
  }, [schedulePush]);

  useEffect(() => {
    if (!ready) return;
    if (session.mode === 'cloud' && supabase()) {
      repo.current = supabaseRepo(session.userId);
      pull();
    } else {
      repo.current = null;
      setSync({ kind: 'off', code: session.mode === 'demo' ? 'demo' : 'noServer' });
    }
  }, [ready, session.mode, session.userId, pull]);

  // уход со страницы — отправить немедленно; возврат без изменений — подтянуть облако
  useEffect(() => {
    if (session.mode !== 'cloud') return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') pushNow();
      else if (!pendingDays.current.size && !pendingProfile.current) pull();
    });
    let off = () => {};
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const h = () => pushNow();
      window.addEventListener('pagehide', h);
      off = () => window.removeEventListener('pagehide', h);
    }
    return () => {
      sub.remove();
      off();
    };
  }, [session.mode, pushNow, pull]);

  // ---- действия ----
  const touchDays = (dates: ISODate[]) => {
    dates.forEach((d) => pendingDays.current.add(d));
    schedulePush();
  };
  const touchProfile = () => {
    pendingProfile.current = true;
    schedulePush();
  };

  const endLocal = (cur: AppData, how: 'ended' | 'removed'): AppData => {
    const today = todayISO();
    const c = cur.curator;
    if (!c) return cur;
    const acc = cur.curatorAccount && cur.curatorAccount.code === c.code ? setReferralStatus(cur.curatorAccount, SELF_ID, how, today) : cur.curatorAccount;
    // предложение — только тем, кто пришёл по коду и закончил ведение (не отвязан куратором)
    const offer = how === 'ended' && c.premium !== false ? makeOffer(c.name, c.code, today) : cur.offer;
    return { ...cur, curator: undefined, curatorAccount: acc, offer };
  };

  const api: StoreApi = {
    ready,
    session,
    data,
    sync,
    plan: data.curator && data.curator.premium !== false ? 'premium' : data.profile.plan,
    setDay: (date, patch) => {
      setData((cur) => {
        const merged = compactEntry({ ...(cur.days[date] || {}), ...patch, updatedAt: Date.now() });
        const days = { ...cur.days };
        if (Object.keys(merged).filter((k) => k !== 'updatedAt').length) days[date] = merged;
        else delete days[date];
        return { ...cur, days };
      });
      touchDays([date]);
    },
    clearDay: (date) => {
      setData((cur) => {
        const days = { ...cur.days };
        delete days[date];
        return { ...cur, days };
      });
      touchDays([date]);
    },
    replaceDays: (days) => {
      const changed = Object.keys(days).filter((d) => days[d] !== dataRef.current.days[d]);
      setData((cur) => ({ ...cur, days }));
      touchDays(changed);
    },
    setProfile: (patch) => {
      setData((cur) => ({ ...cur, profile: { ...cur.profile, ...patch } }));
      touchProfile();
    },
    setKeep: (date, keep) => {
      setData((cur) => {
        const k = { ...cur.keep };
        if (keep) k[date] = true;
        else delete k[date];
        return { ...cur, keep: k };
      });
      touchProfile();
    },
    setHand: (h) => setData((cur) => ({ ...cur, hand: h })),
    addRef: (r) => setData((cur) => ({ ...cur, refs: [r, ...cur.refs.filter((x) => x.id !== r.id)] })),
    removeRef: (id) => setData((cur) => ({ ...cur, refs: cur.refs.filter((x) => x.id !== id) })),
    logPhoto: (d) => setData((cur) => ({ ...cur, photoUsage: [...cur.photoUsage.filter((x) => x >= '2000'), d].slice(-200) })),
    addMeal: (date, m) => {
      setData((cur) => {
        const merged = compactEntry({ ...(cur.days[date] || {}), ...addPhotoMeal(cur.days[date], m), updatedAt: Date.now() });
        const edits = editsFromMeal(m, date);
        return {
          ...cur,
          days: { ...cur.days, [date]: merged },
          photoEdits: edits.length ? [...(cur.photoEdits || []), ...edits].slice(-300) : cur.photoEdits,
        };
      });
      touchDays([date]);
      if (session.mode === 'cloud') savePhotoEstimate(date, m).catch(() => {});
    },
    removeMeal: (date, id) => {
      setData((cur) => {
        const merged = compactEntry({ ...(cur.days[date] || {}), ...removePhotoMeal(cur.days[date], id), updatedAt: Date.now() });
        const days = { ...cur.days };
        if (Object.keys(merged).filter((k) => k !== 'updatedAt').length) days[date] = merged;
        else delete days[date];
        return { ...cur, days };
      });
      touchDays([date]);
    },
    setCurator: (c) => setData((cur) => ({ ...cur, curator: c })),
    linkByCode: async (input, selfName) => {
      const code = normalizeCode(input);
      const today = todayISO();
      const access = (name: string): CuratorAccess => ({ name, code, linkedAt: today, share: { ...DEFAULT_SHARE }, premium: true });
      if (session.mode === 'cloud') {
        try {
          const name = await linkCurator(code);
          setData((cur) => ({ ...cur, curator: access(name), invite: undefined }));
          return null;
        } catch (e) {
          const m = String((e as { message?: string })?.message || e);
          if (/no_seats/.test(m)) return 'noSeats';
          if (/not_found/.test(m)) return 'notFound';
          if (/bad_format/.test(m)) return 'format';
          throw e;
        }
      }
      // без сервера код ищется в кабинете куратора на этом же устройстве (в демо — демо-куратор)
      const acc = dataRef.current.curatorAccount;
      const err = checkCode(code, acc, SELF_ID);
      if (err) return err;
      setData((cur) => ({
        ...cur,
        curator: access(acc!.displayName),
        curatorAccount: addReferral(cur.curatorAccount!, { id: SELF_ID, name: selfName }, today),
        invite: undefined,
      }));
      return null;
    },
    unlinkCurator: () => {
      if (session.mode === 'cloud') clientEndLink().catch(() => {});
      setData((cur) => endLocal(cur, 'ended'));
    },
    acceptOffer: () => {
      const today = todayISO();
      setData((cur) => {
        if (!offerOpen(cur.offer, today)) return cur;
        const o = cur.offer!;
        const acc = cur.curatorAccount && cur.curatorAccount.code === o.code ? markPaid(cur.curatorAccount, SELF_ID, today) : cur.curatorAccount;
        return {
          ...cur,
          offer: { ...o, acceptedAt: today, discountUntil: addMonthsClamped(today, o.months) },
          curatorAccount: acc,
          profile: { ...cur.profile, plan: 'premium' },
        };
      });
      touchProfile();
    },
    dismissOffer: () => setData((cur) => ({ ...cur, offer: undefined })),
    setInvite: (code) => setData((cur) => ({ ...cur, invite: code })),
    createCuratorAccount: (surname, displayName) => {
      setData((cur) => {
        if (cur.curatorAccount) return cur;
        const seq = (cur.promoSeq || 0) + 1;
        return {
          ...cur,
          promoSeq: seq,
          curatorAccount: { surname: surname.trim(), displayName: displayName.trim() || surname.trim(), code: makeCode(surname, seq), plan: 'start', createdAt: todayISO(), referrals: [] },
        };
      });
    },
    setCuratorPlan: (plan) => setData((cur) => (cur.curatorAccount ? { ...cur, curatorAccount: { ...cur.curatorAccount, plan } } : cur)),
    endReferral: (id, how) => {
      const today = todayISO();
      setData((cur) => {
        if (!cur.curatorAccount) return cur;
        // клиент на этом же устройстве — он тоже узнаёт, что ведение закончилось
        if (id === SELF_ID && cur.curator?.code === cur.curatorAccount.code) return endLocal(cur, how);
        return { ...cur, curatorAccount: setReferralStatus(cur.curatorAccount, id, how, today) };
      });
    },
    setConsent: (c) => setData((cur) => ({ ...cur, consent: { ...cur.consent, ...c } })),
    markBackup: () => setData((cur) => ({ ...cur, lastBackupAt: Date.now() })),
    setGoal: (g) => {
      const start = todayISO();
      setData((cur) => ({ ...cur, profile: { ...cur.profile, goals: withGoal(cur.profile.goals, { ...g, start }) } }));
      touchProfile();
    },
    recalcGoal: () => {
      const d = todayISO();
      setData((cur) => ({
        ...cur,
        profile: { ...cur.profile, goalRecalc: [...(cur.profile.goalRecalc || []).filter((x) => x !== d), d].slice(-60) },
      }));
      touchProfile();
    },
    answerProposal: async (id, accept) => {
      const p = dataRef.current.goalProposals?.find((x) => x.id === id);
      if (!p) return;
      if (session.mode === 'cloud') await respondGoalProposal(id, accept);
      const start = todayISO();
      setData((cur) => ({
        ...cur,
        goalProposals: (cur.goalProposals || []).filter((x) => x.id !== id),
        profile: accept ? { ...cur.profile, goals: withGoal(cur.profile.goals, { ...p.setting, start, by: 'curator' }) } : cur.profile,
      }));
      if (accept) touchProfile();
    },
    startLocal: (role) => {
      setSession({ mode: 'local', userId: 'local', role });
    },
    startDemo: (role, labels) => {
      const today = todayISO();
      // язык и тема, выбранные на экране входа, сохраняются
      setData((cur) => ({
        ...EMPTY,
        profile: { ...demoProfile(labels, today), lang: cur.profile.lang, theme: cur.profile.theme },
        days: demoDays(today, labels),
        curatorAccount: demoCuratorAccount(today, labels),
        invite: cur.invite,
        consent: { health: today, terms: today, privacy: today, version: LEGAL_VERSION },
      }));
      setSession({ mode: 'demo', userId: 'demo', role });
    },
    startCloud: async () => {
      const u = await currentUser();
      if (u) setSession({ mode: 'cloud', userId: u.id, email: u.email, role: session.role });
    },
    setRole: (role) => setSession((s) => ({ ...s, role })),
    logout: async () => {
      if (session.mode === 'cloud') {
        await pushNow();
        await signOut();
      }
      if (session.mode === 'demo') await clearAll();
      pendingDays.current.clear();
      pendingProfile.current = false;
      if (session.mode === 'demo')
        setData((cur) => ({ ...EMPTY, profile: { ...DEFAULT_PROFILE, lang: cur.profile.lang, theme: cur.profile.theme } }));
      setSession({ mode: 'none', userId: '', role: 'client' });
    },
    importBackup: (inc) => {
      setData((cur) => {
        const days = mergeDays(cur.days, inc.days || {});
        Object.keys(inc.days || {}).forEach((d) => pendingDays.current.add(d));
        return {
          ...cur,
          days,
          profile: inc.profile ? { ...cur.profile, ...(inc.profile as Profile) } : cur.profile,
          keep: { ...cur.keep, ...(inc.keep || {}) },
          hand: cur.hand || inc.hand,
          refs: [...cur.refs, ...(inc.refs || []).filter((r) => !cur.refs.some((x) => x.id === r.id))],
          photoEdits: [...(cur.photoEdits || []), ...(inc.photoEdits || []).filter((e) => !(cur.photoEdits || []).some((x) => x.at === e.at && x.name === e.name))].slice(-300),
        };
      });
      touchProfile();
    },
  };

  const value = useMemo(() => api, [ready, session, data, sync]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}
