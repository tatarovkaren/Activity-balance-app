// Языки интерфейса: провайдер и хук. Логика выбора языка и словари — в ./core.ts.

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import type { LangPref } from '../core/types';
import { i18nFor, resolveLang, type I18n } from './core';

export * from './core';

const Ctx = createContext<I18n>(i18nFor('ru'));

export function I18nProvider({ pref, children }: { pref: LangPref | undefined; children: React.ReactNode }) {
  const lang = resolveLang(pref);
  const value = useMemo(() => i18nFor(lang), [lang]);
  useEffect(() => {
    // язык страницы — для озвучки, переносов и перевода в браузере
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
