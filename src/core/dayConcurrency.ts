import type {DayEntry} from './types';
const equal=(a:unknown,b:unknown):boolean=>{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
 return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.prototype.hasOwnProperty.call(y,k)&&equal(x[k],y[k]));
};
export function reconcileDay(base:DayEntry|null,local:DayEntry|null,remote:DayEntry|null):{status:'ok';entry:DayEntry|null}|{status:'conflict';fields:string[]}{
 if(equal(local,base))return {status:'ok',entry:remote};
 if(equal(remote,base)||equal(local,remote))return {status:'ok',entry:local};
 if(!local||!remote)return {status:'conflict',fields:['day']};
 const b=(base??{}) as Record<string,unknown>,l=local as Record<string,unknown>,r=remote as Record<string,unknown>;
 const out={...remote} as Record<string,unknown>,fields:string[]=[];
 const nutrition=['kcal','protein','fat','carbs','kcalManual','photoMeals'];
 const changed=(keys:string[],x:Record<string,unknown>)=>keys.some(k=>!equal(b[k],x[k]));
 if(changed(nutrition,l)&&changed(nutrition,r)&&nutrition.some(k=>!equal(l[k],r[k])))fields.push('nutrition');
 for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
 if(k==='updatedAt')continue;
 if(equal(l[k],b[k]))continue;
 if(!equal(r[k],b[k])&&!equal(l[k],r[k])){fields.push(k);continue;}
 if(l[k]===undefined)delete out[k];else out[k]=l[k];
 }
 if(fields.length)return {status:'conflict',fields};
 out.updatedAt=Math.max(local.updatedAt??0,remote.updatedAt??0);
 return {status:'ok',entry:out as DayEntry};
}
