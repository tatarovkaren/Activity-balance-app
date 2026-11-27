import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const AUTH_BASE = 'https://authentication.fatsecret.com/oauth';
export const API_BASE = 'https://platform.fatsecret.com/rest/server.api';
const enc = (x) => encodeURIComponent(String(x)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export const sign = (method, url, params, consumerSecret, tokenSecret = '') => {
  const pairs = Object.entries(params).map(([k, v]) => [enc(k), enc(v)]).sort(([a,av],[b,bv]) => a.localeCompare(b) || av.localeCompare(bv));
  const normalized = pairs.map(([k,v]) => k + '=' + v).join('&');
  const base = [method.toUpperCase(), enc(url), enc(normalized)].join('&');
  return createHmac('sha1', enc(consumerSecret) + '&' + enc(tokenSecret)).update(base).digest('base64');
};
const oauthParams = (token) => ({
  oauth_consumer_key: process.env.FS_CONSUMER_KEY,
  ...(token ? { oauth_token: token } : {}),
  oauth_nonce: randomBytes(18).toString('hex'),
  oauth_timestamp: String(Math.floor(Date.now()/1000)),
  oauth_signature_method: 'HMAC-SHA1',
  oauth_version: '1.0'
});
export async function oauthCall(method, url, extra = {}, token = '', tokenSecret = '') {
  const params = { ...extra, ...oauthParams(token) };
  params.oauth_signature = sign(method, url, params, process.env.FS_CONSUMER_SECRET, tokenSecret);
  const query = new URLSearchParams(params);
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(method === 'GET' ? url + '?' + query : url, {
      method, ...(method === 'POST' ? { headers: {'content-type':'application/x-www-form-urlencoded'}, body:query.toString() } : {}),
      redirect:'error', signal:ctrl.signal, cache:'no-store'
    });
    const raw = await res.text();
    if (!res.ok || raw.length > 100000) throw new Error('fatsecret_http_' + res.status);
    return raw;
  } finally { clearTimeout(timeout); }
}
export function readOAuthForm(s) {
  const q = new URLSearchParams(s);
  const token = q.get('oauth_token'), secret = q.get('oauth_token_secret');
  if (!token || !secret || token.length > 512 || secret.length > 512) throw new Error('bad_oauth_response');
  return {token,secret};
}
export const configured = () => Boolean(
  process.env.FS_CONSUMER_KEY && process.env.FS_CONSUMER_SECRET &&
  (process.env.PILOT_ACCESS_CODE?.length || 0) >= 24 &&
  /^[0-9a-fA-F]{64}$/.test(process.env.PILOT_SESSION_KEY || '') &&
  /^https:\/\/[a-z0-9.-]+$/.test(process.env.PILOT_ORIGIN || '')
);
const key = () => Buffer.from(process.env.PILOT_SESSION_KEY,'hex');
export function seal(value, seconds) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const payload = Buffer.from(JSON.stringify({ ...value,exp:Math.floor(Date.now()/1000)+seconds }));
  const encrypted = Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function unseal(value) {
  if (!value || typeof value !== 'string' || value.length > 9000) return null;
  try {
    const data = Buffer.from(value,'base64url'); if (data.length < 29) return null;
    const cipher = createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));
    cipher.setAuthTag(data.subarray(12,28));
    const dataOut = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
    if (!dataOut.exp || dataOut.exp < Date.now()/1000) return null;
    return dataOut;
  } catch {return null;}
}
const cookieMap=(req)=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>[x.split('=')[0],x.slice(x.indexOf('=')+1)]));
export const getCookie=(req,name)=>cookieMap(req)[name];
export const state=(req,name)=>unseal(getCookie(req,name));
export const cookie=(name,value,maxAge=0)=>name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; '+(maxAge ? 'Max-Age='+maxAge : 'Max-Age=0');
export const noStore=(res)=>{res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');};
export const json=(res,status,data)=>{noStore(res);res.status(status).json(data);};
export function sameOrigin(req) {return req.headers.origin === process.env.PILOT_ORIGIN;}
export const gate=(req)=>state(req,'fs_gate')?.ok === true;
export function checkCode(value){
  if(typeof value !== 'string' || value.length > 1024) return false;
  const a=createHash('sha256').update(value).digest();
  const b=createHash('sha256').update(process.env.PILOT_ACCESS_CODE || '').digest();
  return timingSafeEqual(a,b);
}
export const isGet=(req,res)=>{if(req.method==='GET')return true;json(res,405,{error:'method_not_allowed'});return false;};
export const isPost=(req,res)=>{if(req.method==='POST')return true;json(res,405,{error:'method_not_allowed'});return false;};
export function monthDate(month) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return null;
  const d=new Date(month+'-01T00:00:00Z');
  if(!Number.isFinite(d.getTime()) || d.getTime()>Date.now()+86400000)return null;
  return Math.floor(d.getTime()/86400000);
}
export function parseMonth(raw){
  const object=JSON.parse(raw);
  if(object?.error || object?.errors) throw new Error('fatsecret_api_denied');
  const row=object?.month?.day;
  const days=(Array.isArray(row)?row:row?[row]:[]).map(x=>{
    const dateInt=Number(x.date_int);
    if(!Number.isInteger(dateInt) || dateInt < 0 || dateInt > 50000)return null;
    const n=v=>v==null?null:Number(v);
    const vals=[n(x.calories),n(x.protein),n(x.fat),n(x.carbohydrate)];
    if(vals.some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>100000)))return null;
    return {date:new Date(dateInt*86400000).toISOString().slice(0,10),kcal:vals[0],protein:vals[1],fat:vals[2],carbs:vals[3]};
  }).filter(Boolean);
  return {days,count:days.length};
}
