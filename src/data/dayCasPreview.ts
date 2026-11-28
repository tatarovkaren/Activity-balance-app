import type {DayEntry} from '../core/types';
import {reconcileDay} from '../core/dayConcurrency';
export interface DayCasTransport {
 read(date:string):Promise<DayEntry|null>;
 swap(date:string,expected:DayEntry|null,next:DayEntry|null):Promise<boolean>;
}
export async function saveDayPreview(transport:DayCasTransport,date:string,base:DayEntry|null,local:DayEntry|null){
 for(let attempt=0;attempt<3;attempt++){
  const remote=await transport.read(date);
  const merged=reconcileDay(base,local,remote);
  if(merged.status==='conflict')return merged;
  if(await transport.swap(date,remote,merged.entry))return {status:'saved' as const,entry:merged.entry};
 }
 return {status:'retry_required' as const};
}
