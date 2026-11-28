import {describe,it,expect} from 'vitest';
import {reconcileDay} from './dayConcurrency';
describe('day reconciliation',()=>{
 it('preserves imported nutrition when stale device adds steps',()=>expect(reconcileDay({weight:75},{weight:75,steps:2000},{weight:75,kcal:1500,protein:100})).toEqual({status:'ok',entry:{weight:75,kcal:1500,protein:100,steps:2000,updatedAt:0}}));
 it('rejects concurrent nutrition edits even across different fields',()=>expect(reconcileDay({kcal:1000},{kcal:1200},{kcal:1000,protein:100}).status).toBe('conflict'));
 it('rejects deletion of remotely changed day',()=>expect(reconcileDay({weight:75},null,{weight:75,kcal:1500}).status).toBe('conflict'));
 it('preserves explicit deletion of a field if remote changed another',()=>expect(reconcileDay({weight:75,steps:1000},{weight:75},{weight:75,steps:1000,kcal:1500})).toEqual({status:'ok',entry:{weight:75,kcal:1500,updatedAt:0}}));
});
