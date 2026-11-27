import { AUTH_BASE, configured, gate, state, oauthCall, readOAuthForm, seal, cookie, noStore, json, isGet } from '../lib/oauth.js';
export default async function handler(req,res) {
  if(!isGet(req,res))return;
  if(!configured() || !gate(req))return json(res,403,{error:'pilot_locked'});
  const pending=state(req,'fs_pending');
  const token=req.query?.oauth_token, verifier=req.query?.oauth_verifier;
  if(!pending || !token || token!==pending.token || !verifier || !/^[a-zA-Z0-9_-]{1,256}$/.test(verifier)){
    return json(res,400,{error:'authorization_expired_or_denied'});
  }
  try {
    const raw=await oauthCall('GET',AUTH_BASE+'/access_token',{oauth_verifier:verifier},pending.token,pending.secret);
    const pair=readOAuthForm(raw);
    noStore(res);
    res.setHeader('Set-Cookie',[cookie('fs_pending','',0),cookie('fs_access',seal(pair,900),900)]);
    res.writeHead(302,{Location:'/'});res.end();
  }catch{json(res,502,{error:'oauth_access_denied'});}
}
