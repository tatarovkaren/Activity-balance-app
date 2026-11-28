const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const url = 'https://platform.fatsecret.com/rest/server.api';
export async function readFatSecretMonth(pair:{token:string;secret:string}, month:string, consumer:{key:string;secret:string}, fetcher:typeof fetch=fetch) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > new Date().toISOString().slice(0,7)) throw new Error('invalid_month');
 if (!consumer.key || !consumer.secret || !pair.token || !pair.secret) throw new Error('not_configured');
 const params:Record<string,string> = {
 method:'food_entries.get_month.v2',format:'json',date:String(Date.parse(month+'-01T00:00:00Z')/86400000),
 oauth_consumer_key:consumer.key,oauth_token:pair.token,oauth_nonce:crypto.randomUUID().replace(/-/g,''),
 oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_signature_method:'HMAC-SHA1',oauth_version:'1.0'
 };
 const normalized=Object.entries(params).map(([k,v])=>[enc(k),enc(v)]).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('&');
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(enc(consumer.secret)+'&'+enc(pair.secret)),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 params.oauth_signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('GET&'+enc(url)+'&'+enc(normalized))))));
 const response=await fetcher(url+'?'+new URLSearchParams(params),{method:'GET',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000)});
 if(!response.ok) throw new Error('fatsecret_read_failed');
 const raw=await response.text();
 if(raw.length>100000) throw new Error('fatsecret_response_too_large');
 const data=JSON.parse(raw);
 if(!data || data.error || data.errors || !data.month) throw new Error('fatsecret_read_failed');
 return data;
}
