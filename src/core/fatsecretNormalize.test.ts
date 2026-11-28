import {describe,it,expect} from 'vitest';
import {normalizeFatSecretMonth} from '../../supabase/functions/_shared/fatsecret-normalize';
const date_int=String(Date.parse('2025-01-01')/86400000);
const row={date_int,calories:'1200',protein:'100',fat:'40',carbohydrate:'110'};
describe('FatSecret normalization',()=>{
 it('normalizes numeric strings',()=>expect(normalizeFatSecretMonth({month:{day:row}},'2025-01').days).toEqual([{date:'2025-01-01',kcal:1200,protein:100,fat:40,carbs:110}]));
 it('keeps missing distinct from zero',()=>{
  expect(normalizeFatSecretMonth({month:{day:{...row,fat:null}}},'2025-01')).toEqual({days:[],incompleteDates:['2025-01-01']});
  expect(normalizeFatSecretMonth({month:{day:{...row,fat:'0'}}},'2025-01').days[0].fat).toBe(0);
 });
 it('rejects duplicates and out-of-month records',()=>{
  expect(()=>normalizeFatSecretMonth({month:{day:[row,row]}},'2025-01')).toThrow();
  expect(()=>normalizeFatSecretMonth({month:{day:row}},'2025-02')).toThrow();
 });
 it('rejects malformed nutrition and API errors',()=>{
  expect(()=>normalizeFatSecretMonth({month:{day:{...row,fat:'bad'}}},'2025-01')).toThrow();
  expect(()=>normalizeFatSecretMonth({error:{code:1}},'2025-01')).toThrow();
 });
});
