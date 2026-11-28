import { requireFatSecretUser } from './fatsecret-auth';
import { decryptPair } from './fatsecret-crypto';
type Verify = Parameters<typeof requireFatSecretUser>[1];
type Dependencies = {
  verify: Verify;
  loadEncryptedPair: (verifiedUserId: string) => Promise<string | null>;
  encryptionKey: string;
  readMonth: (pair: {token:string;secret:string}, month: string) => Promise<unknown>;
};
export async function readFatSecretPreview(request: Request, month: string, deps: Dependencies): Promise<unknown> {
  const userId = await requireFatSecretUser(request,deps.verify);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > new Date().toISOString().slice(0,7)) throw new Error('invalid_month');
  const encrypted = await deps.loadEncryptedPair(userId);
  if (!encrypted) throw new Error('not_connected');
  const pair = await decryptPair(encrypted,userId,'access',deps.encryptionKey);
  return deps.readMonth(pair,month);
}
