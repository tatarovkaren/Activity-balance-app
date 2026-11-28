import type {SupabaseClient} from '@supabase/supabase-js';
import type {DayEntry} from '../core/types';
import type {DayCasTransport} from './dayCasPreview';
const previewOrigin='https://pnqeznuzxrzybanuhwnr.supabase.co';
export function previewDayTransport(client:SupabaseClient,configuredUrl:string):DayCasTransport{
 if(configuredUrl.replace(/\/$/,'')!==previewOrigin)throw new Error('Preview database required');
 async function user(){
  const {data,error}=await client.auth.getUser();
  if(error||!data.user||data.user.is_anonymous)throw new Error('Authentication required');
  return data.user.id;
 }
 return {
 async read(date){
  const id=await user();
  const {data,error}=await client.from('day_entries').select('data').eq('user_id',id).eq('date',date).maybeSingle();
  if(error)throw error;
  return (data?.data as DayEntry|undefined)??null;
 },
 async swap(date,expected,next){
  await user();
  const {data,error}=await client.rpc('day_compare_swap',{p_date:date,p_expected:expected,p_next:next});
  if(error)throw error;
  if(typeof data!=='boolean')throw new Error('Invalid save response');
  return data;
 }
 };
}
