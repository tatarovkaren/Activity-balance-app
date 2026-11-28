type Nutrition = {date:string;kcal:number;protein:number;fat:number;carbs:number};
export function normalizeFatSecretMonth(raw:unknown,month:string):{days:Nutrition[];incompleteDates:string[]} {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('invalid_month');
 const root=raw as {error?:unknown;errors?:unknown;month?:{day?:unknown}};
 if(!root?.month || typeof root.month!=='object' || root.error || root.errors) throw new Error('invalid_response');
 const value=root.month.day;
 const rows=value==null?[]:Array.isArray(value)?value:[value];
 if(rows.length>31) throw new Error('invalid_response');
 const days:Nutrition[]=[],incompleteDates:string[]=[],seen=new Set<string>();
 const number=(v:unknown):number|null=>{
  if(v==null || (typeof v==='string' && !v.trim())) return null;
  if(typeof v!=='number' && (typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))) throw new Error('invalid_nutrition');
  const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000) throw new Error('invalid_nutrition');return n;
 };
 for(const item of rows){
  if(!item||typeof item!=='object') throw new Error('invalid_day');
  const row=item as Record<string,unknown>;
  const d=number(row.date_int);
  if(d===null||!Number.isInteger(d)||d>50000) throw new Error('invalid_day');
  const date=new Date(d*86400000).toISOString().slice(0,10);
  if(!date.startsWith(month+'-')||seen.has(date)) throw new Error('invalid_or_duplicate_day');
  seen.add(date);
  const kcal=number(row.calories),protein=number(row.protein),fat=number(row.fat),carbs=number(row.carbohydrate);
  if(kcal===null||protein===null||fat===null||carbs===null){incompleteDates.push(date);continue;}
  days.push({date,kcal,protein,fat,carbs});
 }
 return {days:days.sort((a,b)=>a.date.localeCompare(b.date)),incompleteDates:incompleteDates.sort()};
}
