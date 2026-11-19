// Веб-пуш без сторонних библиотек: подпись VAPID (RFC 8292) и шифрование aes128gcm (RFC 8291 / 8188)
// на WebCrypto. Работает одинаково в Supabase Edge (Deno) и в Node 20+ (тесты src/core/notify.test.ts).

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as unknown as BufferSource;

export async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, buf(data)));
}

// ---- Ключи VAPID ----

/** Ключи сервера: закрытый в JWK (хранится в базе, таблица notify_secrets), открытый — 65 байт в base64url для приложения. */
export interface VapidKeys {
  publicKey: string;
  privateJwk: JsonWebKey;
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  const privateJwk = await subtle().exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/** Заголовок Authorization для службы пушей (Google, Mozilla, Apple). Подпись ES256, срок 12 часов. */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const key = await subtle().importKey('jwk', { ...keys.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(head + '.' + body))));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ---- Шифрование сообщения ----

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Открытый ключ браузера, base64url (65 байт). */
  p256dh: string;
  /** Секрет браузера, base64url (16 байт). */
  auth: string;
}

/** Тело запроса aes128gcm: соль, размер записи, открытый ключ сервера на один раз, шифротекст. */
export async function encryptPayload(sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const ephemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey));
  const uaKey = await subtle().importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, ephemeral.privateKey, 256));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
  const key = await subtle().importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  // одна запись: сообщение + разделитель 0x02 (последняя запись), без дополнения
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(concat(payload, new Uint8Array([2])))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** Общая часть для шифрования и расшифровки (расшифровку делает браузер; в тестах — мы). */
export async function deriveKeys(shared: Uint8Array, authSecret: Uint8Array, uaPublic: Uint8Array, asPublic: Uint8Array, salt: Uint8Array) {
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  return { cek, nonce };
}

export type PushResult = 'ok' | 'gone' | 'error';

/** Отправить одно сообщение на одно устройство. gone — подписка больше не действует, её надо удалить. */
export async function sendWebPush(sub: PushSubscriptionKeys, message: unknown, keys: VapidKeys, subject: string, ttlSec = 12 * 3600): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'normal',
    },
    body: buf(body) as BodyInit,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'ok' : 'error';
}
