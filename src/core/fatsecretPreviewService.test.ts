import { describe,it,expect,vi } from 'vitest';
import { readFatSecretPreview } from '../../supabase/functions/_shared/fatsecret-preview-service';
import { encryptPair } from '../../supabase/functions/_shared/fatsecret-crypto';
const id='12345678-1234-1234-1234-123456789abc';
const other='22345678-1234-1234-1234-123456789abc';
const key='ab'.repeat(32);
const pair={token:'synthetic',secret:'synthetic-secret'};
const req=new Request('https://example.invalid/?user_id='+other,{headers:{authorization:'Bearer synthetic.jwt'}});
async function setup(owner=id){
 const encrypted=await encryptPair(pair,owner,'access',key);
 return {verify:vi.fn(async()=>({data:{user:{id}},error:null})),loadEncryptedPair:vi.fn(async():Promise<string|null>=>encrypted),encryptionKey:key,readMonth:vi.fn(async(_pair:typeof pair,_month:string)=>({days:[]}))};
}
describe('FatSecret preview service',()=>{
 it('reads only verified account',async()=>{
  const d=await setup();
  expect(await readFatSecretPreview(req,'2025-01',d)).toEqual({days:[]});
  expect(d.loadEncryptedPair).toHaveBeenCalledWith(id);
  expect(d.readMonth).toHaveBeenCalledWith(pair,'2025-01');
 });
 it('rejects another account ciphertext',async()=>{
  const d=await setup(other);
  await expect(readFatSecretPreview(req,'2025-01',d)).rejects.toThrow();
  expect(d.readMonth).not.toHaveBeenCalled();
 });
 it('rejects invalid month before accessing storage',async()=>{
  const d=await setup();
  await expect(readFatSecretPreview(req,'2025-13',d)).rejects.toThrow('invalid_month');
  expect(d.loadEncryptedPair).not.toHaveBeenCalled();
 });
 it('rejects disconnected accounts',async()=>{
  const d=await setup();d.loadEncryptedPair.mockResolvedValue(null);
  await expect(readFatSecretPreview(req,'2025-01',d)).rejects.toThrow('not_connected');
  expect(d.readMonth).not.toHaveBeenCalled();
 });
 it('rejects unauthenticated requests before storage access',async()=>{
  const d=await setup();
  await expect(readFatSecretPreview(new Request('https://example.invalid'),'2025-01',d)).rejects.toThrow('unauthorized');
  expect(d.loadEncryptedPair).not.toHaveBeenCalled();
 });
});
