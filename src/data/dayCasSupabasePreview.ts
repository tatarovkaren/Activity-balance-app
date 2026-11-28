import {createClient} from '@supabase/supabase-js';
import type {DayEntry} from '../core/types';
import type {DayCasTransport} from './dayCasPreview';
const previewOrigin='https://pnqeznuzxrzybanuhwnr.supabase.co';
// Dedicated client: never accept a caller-supplied Production client.
// Token is fixed for this operation, so an account switch cannot redirect a write.
export async function previewDayTransport(configuredUrl:string,publishableKey:string,accessToken:string):Promise<DayCasTransport>{
 if(configuredUrl.replace(/\/$/,'')!==previewOrigin)throw new Error('Preview database required');
 if(!publishableKey||!accessToken)throw new Error('Authentication required');
 const client=createClient(previewOrigin,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+accessToken}}});
 const {data,error}=await client.auth.getUser(accessToken);
 if(error||!data.user||data.user.is_anonymous)throw new Error('Authentication required');
 const id=data.user.id;
 return {
 async read(date){
  const {data,error}=await client.from('day_entries').select('data').eq('user_id',id).eq('date',date).maybeSingle();
  if(error)throw error;
  return (data?.data as DayEntry|undefined)??null;
 },
 async swap(date,expected,next){
  const {data,error}=await client.rpc('day_compare_swap',{p_date:date,p_expected:expected,p_next:next});
  if(error)throw error;
  if(typeof data!=='boolean')throw new Error('Invalid save response');
  return data;
 }
 };
}
