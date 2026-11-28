import { describe,it,expect,vi } from 'vitest';
import { requireFatSecretUser } from '../../supabase/functions/_shared/fatsecret-auth';
const id='12345678-1234-1234-1234-123456789abc';
const request=(token?:string)=>new Request('https://example.invalid/?user_id=forged',{headers:token?{authorization:token}:{}});
describe('FatSecret identity',()=>{
  it('uses only verified identity',async()=>{
    const verify=vi.fn(async()=>({data:{user:{id}},error:null}));
    expect(await requireFatSecretUser(request('Bearer synthetic.jwt'),verify)).toBe(id);
    expect(verify).toHaveBeenCalledWith('synthetic.jwt');
  });
  it('rejects missing and malformed authorization',async()=>{
    const verify=vi.fn(async()=>({data:{user:{id}},error:null}));
    await expect(requireFatSecretUser(request(),verify)).rejects.toThrow();
    await expect(requireFatSecretUser(request('Basic abc'),verify)).rejects.toThrow();
    expect(verify).not.toHaveBeenCalled();
  });
  it('rejects anonymous and failed verification',async()=>{
    await expect(requireFatSecretUser(request('Bearer abc'),async()=>({data:{user:{id,is_anonymous:true}},error:null}))).rejects.toThrow();
    await expect(requireFatSecretUser(request('Bearer abc'),async()=>({data:{user:null},error:'invalid'}))).rejects.toThrow();
  });
});
