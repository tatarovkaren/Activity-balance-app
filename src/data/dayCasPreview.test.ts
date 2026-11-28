import {describe,it,expect,vi} from 'vitest';
import {saveDayPreview} from './dayCasPreview';
describe('preview CAS adapter',()=>{
 it('re-reads after race and preserves imported nutrition',async()=>{
 const read=vi.fn().mockResolvedValueOnce({weight:75}).mockResolvedValueOnce({weight:75,kcal:1500});
 const swap=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 const r=await saveDayPreview({read,swap},'2025-01-01',{weight:75},{weight:75,steps:2000});
 expect(r.status).toBe('saved');
 expect(swap).toHaveBeenLastCalledWith('2025-01-01',{weight:75,kcal:1500},{weight:75,kcal:1500,steps:2000,updatedAt:0});
 });
 it('never writes conflicting nutrition',async()=>{
 const swap=vi.fn(async()=>true);
 expect((await saveDayPreview({read:async()=>({kcal:1500}),swap},'2025-01-01',{kcal:1000},{kcal:1200})).status).toBe('conflict');
 expect(swap).not.toHaveBeenCalled();
 });
 it('reports retry required after three races',async()=>{
 const swap=vi.fn(async()=>false);
 expect((await saveDayPreview({read:async()=>null,swap},'2025-01-01',null,{weight:75})).status).toBe('retry_required');
 expect(swap).toHaveBeenCalledTimes(3);
 });
});
