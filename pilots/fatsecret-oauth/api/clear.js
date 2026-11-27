import { cookie, json, noStore, isPost, sameOrigin } from '../lib/oauth.js';
export default function handler(req,res){
  if(!isPost(req,res))return;
  if(!sameOrigin(req))return json(res,403,{error:'origin_denied'});
  noStore(res);
  res.setHeader('Set-Cookie',[cookie('fs_gate','',0),cookie('fs_pending','',0),cookie('fs_access','',0)]);
  res.status(200).json({ok:true});
}
