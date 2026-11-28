import type {DayEntry,DayMap} from './types';
import {stageFatSecretImport,type FatSecretDay} from './fatsecretSync';
export type ImportChange={date:string;expected:DayEntry|null;next:DayEntry};
export interface AtomicImportStore {
 read():Promise<DayMap>;
 // Must atomically compare all expected rows and write all changes or none.
 compareAndSwap(changes:readonly ImportChange[]):Promise<boolean>;
}
export async function commitFatSecretImport(store:AtomicImportStore,rows:readonly FatSecretDay[],selected:readonly string[],now:number){
 const latest=await store.read();
 const staged=stageFatSecretImport(rows,latest,selected,now);
 const changes=staged.applied.map(date=>({date,expected:latest[date]??null,next:staged.days[date]}));
 if(changes.length && !(await store.compareAndSwap(changes))) return {status:'stale' as const,applied:[],conflicts:staged.conflicts,unchanged:staged.unchanged};
 return {status:'committed' as const,applied:staged.applied,conflicts:staged.conflicts,unchanged:staged.unchanged};
}
