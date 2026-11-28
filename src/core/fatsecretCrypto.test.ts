import { describe, it, expect } from 'vitest';
import { encryptPair, decryptPair } from '../../supabase/functions/_shared/fatsecret-crypto';
const key = 'ab'.repeat(32);
const user = '12345678-1234-1234-1234-123456789abc';
const other = '22345678-1234-1234-1234-123456789abc';
const pair = { token: 'synthetic-token', secret: 'synthetic-secret' };
describe('FatSecret server token encryption', () => {
  it('round trips and randomizes ciphertext', async () => {
    const a = await encryptPair(pair,user,'access',key);
    const b = await encryptPair(pair,user,'access',key);
    expect(a).not.toBe(b);
    expect(await decryptPair(a,user,'access',key)).toEqual(pair);
  });
  it('rejects other accounts, purposes and keys', async () => {
    const a = await encryptPair(pair,user,'access',key);
    await expect(decryptPair(a,other,'access',key)).rejects.toThrow();
    await expect(decryptPair(a,user,'pending',key)).rejects.toThrow();
    await expect(decryptPair(a,user,'access','cd'.repeat(32))).rejects.toThrow();
  });
  it('rejects malformed keys and ciphertext', async () => {
    await expect(encryptPair(pair,user,'access','bad')).rejects.toThrow();
    await expect(decryptPair('bad',user,'access',key)).rejects.toThrow();
  });
});
