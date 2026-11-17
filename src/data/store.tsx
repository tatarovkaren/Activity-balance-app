// Состояние приложения: локальная рабочая копия + синхронизация с облаком.
// Правила синхронизации из прототипа: флаг неотправленных изменений; без флага облако главнее;
// с флагом — объединение, где заполненные локальные поля побеждают; пустое не затирает заполненное.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { todayISO, type ISODate } from '../core/dates';
import { compactEntry, mergeDays, mergeEntry } from '../core/merge';
import { DEFAULT_PROFILE, type DayEntry, type DayMap, type KeepMap, type Profile } from '../core/types';
import type { HandProfile } from '../core/photo/estimate';
import { demoDays, demoProfile, type DemoLabels } from '../core/demo';
import { load, save, clearAll } from './storage';
import { currentUser, recordConsents, supabase, supabaseRepo, signOut, type CloudRepo } from './cloud';
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
}

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
  curator?: CuratorAccess;
  consent: Consent;
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
  setDay: (date: ISODate, patch: Partial<DayEntry>) => void;
  clearDay: (date: ISODate) => void;
  replaceDays: (days: DayMap) => void;
  setProfile: (patch: Partial<Profile>) => void;
  setKeep: (date: ISODate, keep: boolean) => void;
  setHand: (h: HandProfile) => void;
  addRef: (r: FoodRef) => void;
  removeRef: (id: string) => void;
  logPhoto: (d: ISODate) => void;
  setCurator: (c: CuratorAccess | undefined) => void;
  setConsent: (c: Consent) => void;
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
      setData({ ...EMPTY, ...d, profile: { ...DEFAULT_PROFILE, ...d.profile } });
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
        const profile = pendingProfile.current || !snap.profile ? cur.profile : { ...DEFAULT_PROFILE, ...snap.profile };
        const keep = pendingProfile.current || !snap.keep ? cur.keep : snap.keep;
        if (!snap.profile) pendingProfile.current = true;
        return { ...cur, days, profile, keep };
      });
      setSync({ kind: 'ok', code: 'synced', at: hhmm() });
      schedulePush();
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

  const api: StoreApi = {
    ready,
    session,
    data,
    sync,
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
    setCurator: (c) => setData((cur) => ({ ...cur, curator: c })),
    setConsent: (c) => setData((cur) => ({ ...cur, consent: { ...cur.consent, ...c } })),
    startLocal: (role) => {
      setSession({ mode: 'local', userId: 'local', role });
    },
    startDemo: (role, labels) => {
      const today = todayISO();
      // язык и тема, выбранные на экране входа, сохраняются
      setData((cur) => ({
        ...EMPTY,
        profile: { ...demoProfile(labels), lang: cur.profile.lang, theme: cur.profile.theme },
        days: demoDays(today, labels),
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
