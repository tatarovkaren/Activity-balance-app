import { AUTH_BASE, configured, gate, oauthCall, readOAuthForm, seal, cookie, noStore, json, isGet } from '../lib/oauth.js';
export default async function handler(req,res) {
  if(!isGet(req,res))return;
  if(!configured() || !gate(req))return json(res,403,{error:'pilot_locked'});
  try{
    const callback=process.env.PILOT_ORIGIN+'/api/callback';
    const raw=await oauthCall('POST',AUTH_BASE+'/request_token',{oauth_callback:callback});
    const pair=readOAuthForm(raw);
    noStore(res);
    res.setHeader('Set-Cookie',cookie('fs_pending',seal(pair,600),600));
    res.writeHead(302,{Location:AUTH_BASE+'/authorize?oauth_token='+encodeURIComponent(pair.token)});res.end();
  }catch{json(res,502,{error:'oauth_request_token_failed'});}
}
