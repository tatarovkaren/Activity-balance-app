import { configured, gate, state, json, isGet } from '../lib/oauth.js';
export default function handler(req,res){
  if(!isGet(req,res))return;
  json(res,200,{configured:configured(),unlocked:configured()&&gate(req),connected:configured()&&gate(req)&&!!state(req,'fs_access')?.token,readOnly:true});
}
