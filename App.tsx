import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { todayISO, type ISODate } from './src/core/dates';
import type { MealSlot } from './src/core/types';
import { StoreProvider, useStore } from './src/data/store';
import { TextSizeProvider, ThemeProvider, useFs, useTheme } from './src/ui/theme';
import { T } from './src/ui/kit';
import { layoutColumns } from './src/ui/layout';
import { I18nProvider, useI18n } from './src/i18n';
import { LoginScreen } from './src/screens/Login';
import { DayScreen } from './src/screens/Day';
import { FactScreen } from './src/screens/Fact';
import { ChartsScreen } from './src/screens/Charts';
import { HandSetup, PhotoScreen } from './src/screens/Photo';
import { ChillDay } from './src/screens/ChillDay';
import { ProfileScreen } from './src/screens/Profile';
import { FoodScreen } from './src/screens/Food';
import { CuratorScreen } from './src/screens/Curator';
import { LegalView, useLegalRoute } from './src/screens/Legal';
import { HelpScreen } from './src/screens/Help';
import { WikiScreen } from './src/screens/Wiki';
import { OnboardingScreen } from './src/screens/Onboarding';
import { reloadApp, useUpdateAvailable } from './src/ui/update';

type Tab = 'day' | 'fact' | 'charts' | 'photo' | 'profile' | 'hand' | 'help' | 'wiki' | 'food';

const TABS: { id: Exclude<Tab, 'hand' | 'help' | 'wiki' | 'food'>; icon: string }[] = [
  { id: 'day', icon: '◉' },
  { id: 'fact', icon: '⚖' },
  { id: 'charts', icon: '📈' },
  { id: 'photo', icon: '📷' },
  { id: 'profile', icon: '⚙' },
];

function Shell() {
  const { ready, session, data, sync } = useStore();
  const t = useTheme();
  const fs = useFs();
  const { tx } = useI18n();
  const [tab, setTab] = useState<Tab>('day');
  const [sel, setSel] = useState<ISODate>(todayISO());
  const [photoMeal, setPhotoMeal] = useState<MealSlot | undefined>();
  const [legal, closeLegal] = useLegalRoute();
  const scroll = useRef<ScrollViewInstance>(null);
  const update = useUpdateAvailable();
  // новый экран открывается сверху (иначе «Помощь» из профиля откроется посередине)
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);

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

  const availableWidth = useWindowDimensions().width;
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const curator = session.mode !== 'none' && session.role === 'curator';
  const showChillWide = !curator && tab === 'day' && data.profile.uiMode === 'chill' && layoutColumns(availableWidth, data.profile.layoutMode) === 2;
  const maxW = curator ? 1200 : showChillWide ? 1100 : 640;
  // первый шаг клиента — анкета: возраст, рост, вес
  const onboarding = session.mode !== 'none' && !curator && !data.profile.onboarded;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {update ? (
        <Pressable
          onPress={reloadApp}
          testID="updateBanner"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: t.blue }}
        >
          <T size={14} color="#fff">{tx.update.text}</T>
          <View style={{ backgroundColor: '#fff', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 12 }}>
            <T size={14} bold color={t.blue}>{tx.update.btn}</T>
          </View>
        </Pressable>
      ) : null}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 112, width: '100%', maxWidth: maxW, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
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
            {tab === 'day' ? data.profile.uiMode === 'chill' ? <ChillDay sel={sel} setSel={setSel} openPhoto={(m) => { setPhotoMeal(m); setTab('photo'); }} openFood={() => setTab('food')} /> : <DayScreen sel={sel} setSel={setSel} openFact={() => setTab('fact')} openPhoto={(m) => { setPhotoMeal(m); setTab('photo'); }} openFood={() => setTab('food')} /> : null}
            {tab === 'food' ? <FoodScreen sel={sel} onBack={() => setTab('day')} /> : null}
            {tab === 'fact' ? <FactScreen sel={sel} /> : null}
            {tab === 'charts' ? <ChartsScreen sel={sel} /> : null}
            {tab === 'photo' ? <PhotoScreen key={photoMeal || 'any'} sel={sel} meal={photoMeal} onBack={() => setTab('day')} /> : null}
            {tab === 'profile' ? <ProfileScreen openHand={() => setTab('hand')} openHelp={() => setTab('help')} openWiki={() => setTab('wiki')} /> : null}
            {tab === 'help' ? <HelpScreen onClose={() => setTab('profile')} /> : null}
            {tab === 'wiki' ? <WikiScreen onClose={() => setTab('profile')} /> : null}
            {tab === 'hand' ? <HandSetup initial={data.hand} onDone={() => setTab('profile')} /> : null}
            <Text style={{ color: sync.kind === 'offline' ? t.amber : t.muted, fontSize: fs(12), textAlign: 'center', marginTop: 8 }} testID="syncStatus">
              {sync.code === 'saved' || sync.code === 'synced' ? tx.sync[sync.code](sync.at || '') : tx.sync[sync.code]}
            </Text>
          </>
        )}
      </ScrollView>
      {session.mode !== 'none' && !curator && !onboarding ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.card, borderTopWidth: 1, borderColor: t.line }}>
          <View style={{ flexDirection: 'row', maxWidth: 640, width: '100%', alignSelf: 'center' }}>
            {TABS.filter((x) => data.profile.uiMode !== 'chill' || x.id === 'day' || x.id === 'profile').map((x) => {
              const on = tab === x.id || (x.id === 'day' && tab === 'food') || (x.id === 'profile' && (tab === 'hand' || tab === 'help' || tab === 'wiki'));
              return (
                <Pressable
                  key={x.id}
                  onPress={() => {
                    if (x.id === 'photo') setPhotoMeal(undefined);
                    setTab(x.id);
                  }}
                  style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 10, borderTopWidth: 3, borderColor: on ? t.amber : 'transparent' }}
                  testID={'tab-' + x.id}
                >
                  <T size={22} color={on ? t.amber : t.muted}>{x.icon}</T>
                  {/* подписи вкладок растут меньше остального текста: пять вкладок должны влезть в 320 px */}
                  <T size={13} bold={on} color={on ? t.amber : t.muted} numberOfLines={1} style={{ fontSize: Math.min(fs(13), 15) }}>
                    {tx.tabs[x.id]}
                  </T>
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
      <ThemeProvider pref={data.profile.theme} palette={data.profile.palette}>
        <TextSizeProvider size={data.profile.textSize}>
          <Shell />
        </TextSizeProvider>
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
