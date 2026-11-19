// «Вышла новая версия»: веб-сборка сравнивает имя своего бандла (index-<хэш>.js) с тем,
// что сейчас отдаёт сервер в index.html. Проверка — при возврате во вкладку и раз в 30 минут.
// Открытая вкладка или установленное PWA сами не перезагружаются, поэтому без плашки
// пользователь мог часами смотреть старую версию.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { bundleName } from './update.parse';

const EVERY_MS = 30 * 60 * 1000;

function currentBundle(): string | null {
  for (const s of Array.from(document.scripts)) {
    const n = s.src ? bundleName(s.src) : null;
    if (n) return n;
  }
  return null; // демо-артефакт: всё встроено в один HTML — проверять нечего
}

/** true — на сервере уже другая сборка. Только веб; в демо и в разработке всегда false. */
export function useUpdateAvailable(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const mine = currentBundle();
    if (!mine) return;
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/?v=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const remote = bundleName(await res.text());
        if (remote && remote !== mine) setReady(true);
      } catch {
        // нет сети — проверим позже
      }
    };
    check();
    const id = setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return ready;
}

export function reloadApp() {
  if (Platform.OS === 'web') window.location.reload();
}
