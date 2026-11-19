// Веб-пуши в браузере (PWA). Android, компьютер — сразу; iPhone и iPad — только из приложения,
// добавленного на экран «Домой», iOS 16.4 и новее. В мобильном приложении будет Expo Push (этап 4).

import { Platform } from 'react-native';
import { deletePushSubscription, notifyInfo, savePushSubscription } from '../data/cloud';

/**
 * on / off — подписан ли этот браузер; denied — пользователь запретил уведомления в настройках браузера;
 * iosInstall — iPhone, сайт открыт в Safari, а не с экрана «Домой»; unsupported — браузер не умеет.
 */
export type PushState = 'on' | 'off' | 'denied' | 'iosInstall' | 'unsupported';

const web = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

export function isIOS(): boolean {
  if (!web()) return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}

export function isStandalone(): boolean {
  if (!web()) return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}

const supported = () => web() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  const r = await navigator.serviceWorker.getRegistration();
  if (r) return r;
  // index.html регистрирует sw.js только на https; на всякий случай — здесь же
  await navigator.serviceWorker.register('sw.js');
  return navigator.serviceWorker.ready;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIOS() && !isStandalone() ? 'iosInstall' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const r = await navigator.serviceWorker.getRegistration();
    const s = await r?.pushManager.getSubscription();
    return s ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

function keyBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Подписать этот браузер: спросить разрешение, получить ключ сервера и сохранить подписку. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return pushState();
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const info = await notifyInfo();
  if (!info) throw new Error('notifyServer');
  const reg = await registration();
  if (!reg) return 'unsupported';
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // подписку старым ключом сервера заменить
    const old = sub.options?.applicationServerKey;
    const now = keyBytes(info.vapidKey);
    const same = old && new Uint8Array(old).every((b, i) => b === now[i]);
    if (!same) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.vapidKey) as BufferSource });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await savePushSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return pushState();
  const r = await navigator.serviceWorker.getRegistration();
  const s = await r?.pushManager.getSubscription();
  if (s) {
    await deletePushSubscription(s.endpoint).catch(() => {});
    await s.unsubscribe();
  }
  return pushState();
}
