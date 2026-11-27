import { API_BASE, configured, gate, state, monthDate, oauthCall, parseMonth, json, isGet } from '../lib/oauth.js';
export default async function handler(req,res) {
  if(!isGet(req,res))return;
  if(!configured() || !gate(req))return json(res,403,{error:'pilot_locked'});
  const access=state(req,'fs_access');
  if(!access?.token || !access?.secret)return json(res,401,{error:'connect_fatsecret_first'});
  const month=String(req.query?.month||new Date().toISOString().slice(0,7));
  const date=monthDate(month);
  if(date===null)return json(res,400,{error:'invalid_month'});
  try{
    const raw=await oauthCall('GET',API_BASE,{method:'food_entries.get_month.v2',date:String(date),format:'json'},access.token,access.secret);
    const parsed=parseMonth(raw);
    return json(res,200,{month,...parsed,source:'FatSecret API — read only',persisted:false});
  }catch{
    return json(res,502,{error:'fatsecret_read_denied_or_unavailable',note:'API key edition/permissions or user consent may not allow this call'});
  }
}
