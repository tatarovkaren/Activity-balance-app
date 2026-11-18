import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { todayISO, type ISODate } from './src/core/dates';
import { StoreProvider, useStore } from './src/data/store';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { T } from './src/ui/kit';
import { I18nProvider, useI18n } from './src/i18n';
import { LoginScreen } from './src/screens/Login';
import { DayScreen } from './src/screens/Day';
import { FactScreen } from './src/screens/Fact';
import { ChartsScreen } from './src/screens/Charts';
import { HandSetup, PhotoScreen } from './src/screens/Photo';
import { ProfileScreen } from './src/screens/Profile';
import { CuratorScreen } from './src/screens/Curator';
import { LegalView, useLegalRoute } from './src/screens/Legal';
import { OnboardingScreen } from './src/screens/Onboarding';

type Tab = 'day' | 'fact' | 'charts' | 'photo' | 'profile' | 'hand';

const TABS: { id: Exclude<Tab, 'hand'>; icon: string }[] = [
  { id: 'day', icon: '◉' },
  { id: 'fact', icon: '⚖' },
  { id: 'charts', icon: '📈' },
  { id: 'photo', icon: '📷' },
  { id: 'profile', icon: '⚙' },
];

function Shell() {
  const { ready, session, data, sync } = useStore();
  const t = useTheme();
  const { tx } = useI18n();
  const [tab, setTab] = useState<Tab>('day');
  const [sel, setSel] = useState<ISODate>(todayISO());
  const [legal, closeLegal] = useLegalRoute();

  // при первом открытии в новый день дата становится сегодняшней
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const h = () => {
      if (document.visibilityState === 'visible') setSel((s) => (s > todayISO() ? todayISO() : s));
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') document.body.style.backgroundColor = t.bg;
  }, [t.bg]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const curator = session.mode !== 'none' && session.role === 'curator';
  const maxW = curator ? 1200 : 640;
  // первый шаг клиента — анкета: возраст, рост, вес
  const onboarding = session.mode !== 'none' && !curator && !data.profile.onboarded;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 112, width: '100%', maxWidth: maxW, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {legal ? (
          <LegalView doc={legal} onClose={closeLegal} />
        ) : session.mode === 'none' ? (
          <LoginScreen />
        ) : curator ? (
          <CuratorScreen />
        ) : onboarding ? (
          <OnboardingScreen />
        ) : (
          <>
            {tab === 'day' ? <DayScreen sel={sel} setSel={setSel} openFact={() => setTab('fact')} /> : null}
            {tab === 'fact' ? <FactScreen sel={sel} /> : null}
            {tab === 'charts' ? <ChartsScreen sel={sel} /> : null}
            {tab === 'photo' ? <PhotoScreen sel={sel} /> : null}
            {tab === 'profile' ? <ProfileScreen openHand={() => setTab('hand')} /> : null}
            {tab === 'hand' ? <HandSetup initial={data.hand} onDone={() => setTab('profile')} /> : null}
            <Text style={{ color: sync.kind === 'offline' ? t.amber : t.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }} testID="syncStatus">
              {sync.code === 'saved' || sync.code === 'synced' ? tx.sync[sync.code](sync.at || '') : tx.sync[sync.code]}
            </Text>
          </>
        )}
      </ScrollView>
      {session.mode !== 'none' && !curator && !onboarding ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopWidth: 1, borderColor: t.line }}>
          <View style={{ flexDirection: 'row', maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            {TABS.map((x) => {
              const on = tab === x.id || (x.id === 'profile' && tab === 'hand');
              return (
                <Pressable
                  key={x.id}
                  onPress={() => setTab(x.id)}
                  style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10, borderTopWidth: 3, borderColor: on ? t.amber : 'transparent' }}
                  testID={'tab-' + x.id}
                >
                  <T size={22} color={on ? t.amber : t.muted}>{x.icon}</T>
                  <T size={13} bold={on} color={on ? t.amber : t.muted}>{tx.tabs[x.id]}</T>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Themed() {
  const { data } = useStore();
  return (
    <I18nProvider pref={data.profile.lang}>
      <ThemeProvider pref={data.profile.theme}>
        <Shell />
      </ThemeProvider>
    </I18nProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Themed />
    </StoreProvider>
  );
}
