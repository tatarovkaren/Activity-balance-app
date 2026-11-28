import {describe,it,expect,vi} from 'vitest';
import {commitFatSecretImport} from './fatsecretCommit';
const date='2025-01-01',row={date,kcal:1500,protein:100,fat:50,carbs:160};
describe('atomic import contract',()=>{
 it('passes expected snapshot and preserves other fields',async()=>{
 const compareAndSwap=vi.fn(async()=>true);
 const result=await commitFatSecretImport({read:async()=>({[date]:{weight:75}}),compareAndSwap},[row],[date],1000);
 expect(result.applied).toEqual([date]);
 expect(compareAndSwap).toHaveBeenCalledWith([{date,expected:{weight:75},next:{weight:75,kcal:1500,protein:100,fat:50,carbs:160,kcalManual:true,updatedAt:1000}}]);
 });
 it('reports stale without claiming any writes',async()=>{
 const result=await commitFatSecretImport({read:async()=>({}),compareAndSwap:async()=>false},[row],[date],1000);
 expect(result.status).toBe('stale');expect(result.applied).toEqual([]);
 });
 it('does not call storage for conflicts',async()=>{
 const compareAndSwap=vi.fn(async()=>true);
 const result=await commitFatSecretImport({read:async()=>({[date]:{kcal:0}}),compareAndSwap},[row],[date],1000);
 expect(result.conflicts).toEqual([date]);expect(compareAndSwap).not.toHaveBeenCalled();
 });
});
