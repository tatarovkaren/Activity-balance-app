import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { todayISO, type ISODate } from './src/core/dates';
import { StoreProvider, useStore } from './src/data/store';
import { ThemeProvider, useTheme } from './src/ui/theme';
import { T } from './src/ui/kit';
import { LoginScreen } from './src/screens/Login';
import { DayScreen } from './src/screens/Day';
import { FactScreen } from './src/screens/Fact';
import { ChartsScreen } from './src/screens/Charts';
import { HandSetup, PhotoScreen } from './src/screens/Photo';
import { ProfileScreen } from './src/screens/Profile';
import { CuratorScreen } from './src/screens/Curator';

type Tab = 'day' | 'fact' | 'charts' | 'photo' | 'profile' | 'hand';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'day', label: 'День', icon: '◉' },
  { id: 'fact', label: 'Расход', icon: '⚖' },
  { id: 'charts', label: 'Графики', icon: '📈' },
  { id: 'photo', label: 'Фото', icon: '📷' },
  { id: 'profile', label: 'Профиль', icon: '⚙' },
];

function Shell() {
  const { ready, session, data, sync } = useStore();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('day');
  const [sel, setSel] = useState<ISODate>(todayISO());

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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96, width: '100%', maxWidth: maxW, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {session.mode === 'none' ? (
          <LoginScreen />
        ) : curator ? (
          <CuratorScreen />
        ) : (
          <>
            {tab === 'day' ? <DayScreen sel={sel} setSel={setSel} openFact={() => setTab('fact')} /> : null}
            {tab === 'fact' ? <FactScreen sel={sel} /> : null}
            {tab === 'charts' ? <ChartsScreen sel={sel} /> : null}
            {tab === 'photo' ? <PhotoScreen sel={sel} /> : null}
            {tab === 'profile' ? <ProfileScreen openHand={() => setTab('hand')} /> : null}
            {tab === 'hand' ? <HandSetup initial={data.hand} onDone={() => setTab('profile')} /> : null}
            <Text style={{ color: sync.kind === 'offline' ? t.amber : t.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }} testID="syncStatus">
              {sync.text}
            </Text>
          </>
        )}
      </ScrollView>
      {session.mode !== 'none' && !curator ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopWidth: 1, borderColor: t.line }}>
          <View style={{ flexDirection: 'row', maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            {TABS.map((x) => {
              const on = tab === x.id || (x.id === 'profile' && tab === 'hand');
              return (
                <Pressable key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }} testID={'tab-' + x.id}>
                  <T size={16} color={on ? t.amber : t.muted}>{x.icon}</T>
                  <T size={11} color={on ? t.amber : t.muted}>{x.label}</T>
                </Pressable>
              );
            })}
          </View>
          {width < 380 ? null : null}
        </View>
      ) : null}
    </View>
  );
}

function Themed() {
  const { data } = useStore();
  return (
    <ThemeProvider pref={data.profile.theme}>
      <Shell />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Themed />
    </StoreProvider>
  );
}
