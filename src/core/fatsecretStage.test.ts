import {describe,it,expect} from 'vitest';
import {stageFatSecretImport} from './fatsecretSync';
const date='2025-01-01', row={date,kcal:1500,protein:100,fat:50,carbs:160};
describe('FatSecret staging',()=>{
 it('preserves other fields and original snapshot',()=>{
  const latest={[date]:{weight:75,steps:9000,waist:85}};
  const result=stageFatSecretImport([row],latest,[date],1000);
  expect(result.days[date]).toEqual({...latest[date],kcal:1500,protein:100,fat:50,carbs:160,kcalManual:true,updatedAt:1000});
  expect(latest[date]).toEqual({weight:75,steps:9000,waist:85});
 });
 it('does not overwrite fresh manual entries',()=>{
  const latest={[date]:{kcal:0}};
  const result=stageFatSecretImport([row],latest,[date],1000);
  expect(result.conflicts).toEqual([date]);expect(result.days).toEqual(latest);
 });
 it('repeat is idempotent and unselected days stay untouched',()=>{
  const first=stageFatSecretImport([row],{},[date],1000);
  const repeat=stageFatSecretImport([row],first.days,[date],2000);
  expect(repeat.applied).toEqual([]);expect(repeat.unchanged).toEqual([date]);expect(repeat.days).toEqual(first.days);
  expect(stageFatSecretImport([row],{},[],1000).days).toEqual({});
 });
});
