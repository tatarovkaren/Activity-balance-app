import { configured, checkCode, cookie, seal, json, noStore, isPost, sameOrigin } from '../lib/oauth.js';
export default function handler(req,res) {
  if(!isPost(req,res))return;
  if(!configured())return json(res,503,{error:'awaiting_server_configuration'});
  if(!sameOrigin(req))return json(res,403,{error:'origin_denied'});
  if(!checkCode(req.body?.code))return json(res,403,{error:'invalid_access_code'});
  noStore(res);
  res.setHeader('Set-Cookie',cookie('fs_gate',seal({ok:true},3600),3600));
  res.status(200).json({ok:true});
}
