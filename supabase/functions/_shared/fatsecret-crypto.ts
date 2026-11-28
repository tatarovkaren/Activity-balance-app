// Server-only primitive. Never import into the Expo client.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
type TokenPair = { token: string; secret: string };
function validPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== 'object') return false;
  const p = value as TokenPair;
  return [p.token,p.secret].every(v => typeof v === 'string' && v.length > 0 && v.length <= 512);
}
async function key(hex: string) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('invalid encryption key');
  return crypto.subtle.importKey('raw', Uint8Array.from(hex.match(/../g)!, x => parseInt(x,16)), 'AES-GCM', false, ['encrypt','decrypt']);
}
function aad(userId: string, purpose: 'pending' | 'access') {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('invalid user');
  return encoder.encode('fatsecret:v1:' + purpose + ':' + userId.toLowerCase());
}
export async function encryptPair(pair: TokenPair, userId: string, purpose: 'pending' | 'access', hex: string): Promise<string> {
  if (!validPair(pair)) throw new Error('invalid token pair');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(userId,purpose)},await key(hex),encoder.encode(JSON.stringify(pair))));
  return 'v1.' + btoa(String.fromCharCode(...iv,...encrypted));
}
export async function decryptPair(value: string, userId: string, purpose: 'pending' | 'access', hex: string): Promise<TokenPair> {
  if (!value.startsWith('v1.') || value.length > 8192) throw new Error('invalid ciphertext');
  const bytes = Uint8Array.from(atob(value.slice(3)), c => c.charCodeAt(0));
  if (bytes.length < 29) throw new Error('invalid ciphertext');
  const raw = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:aad(userId,purpose)},await key(hex),bytes.slice(12));
  const pair: unknown = JSON.parse(decoder.decode(raw));
  if (!validPair(pair)) throw new Error('invalid token pair');
  return pair;
}
