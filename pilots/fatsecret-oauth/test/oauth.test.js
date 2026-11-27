import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sign,seal,unseal,monthDate,parseMonth,checkCode,configured } from '../lib/oauth.js';
import { createHmac } from 'node:crypto';
process.env.PILOT_SESSION_KEY='1'.repeat(64);
process.env.PILOT_ACCESS_CODE='test-only-access-code-123456789';
process.env.PILOT_ORIGIN='https://pilot.example.invalid';
process.env.FS_CONSUMER_KEY='dummy';
process.env.FS_CONSUMER_SECRET='dummy-secret';
test('OAuth signing follows RFC3986 and HMAC-SHA1',()=>{
  const params={oauth_consumer_key:'demo',oauth_signature_method:'HMAC-SHA1',oauth_timestamp:'12345678',oauth_nonce:'abc',oauth_version:'1.0',a:'foo',z:'bar'};
  const expected=createHmac('sha1','secret&').update('POST&https%3A%2F%2Fplatform.fatsecret.com%2Frest%2Fserver.api&a%3Dfoo%26oauth_consumer_key%3Ddemo%26oauth_nonce%3Dabc%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D12345678%26oauth_version%3D1.0%26z%3Dbar').digest('base64');
  assert.equal(sign('POST','https://platform.fatsecret.com/rest/server.api',params,'secret'),expected);
});
test('sealed sessions cannot be tampered with',()=>{
  const c=seal({ok:true,token:'secret'},30);
  assert.equal(unseal(c).token,'secret');
  assert.equal(unseal(c.slice(0,-2)+'AA'),null);
  assert.equal(unseal('garbage'),null);
});
test('configuration requires all secrets',()=>{
  assert.equal(configured(),true);
  assert.equal(checkCode('bad'),false);
  assert.equal(checkCode(process.env.PILOT_ACCESS_CODE),true);
});
test('month parameter rejects future/invalid months',()=>{
  assert.equal(monthDate('not-a-month'),null);
  assert.equal(monthDate('2026-13'),null);
  assert.equal(monthDate('2099-01'),null);
  assert.equal(monthDate('2026-11'),Math.floor(Date.parse('2026-11-01T00:00:00Z')/86400000));
});
test('one or several days maps to only daily nutrition fields',()=>{
  const one=parseMonth(JSON.stringify({month:{day:{date_int:20000,calories:'1700',protein:'100',fat:'60',carbohydrate:'200'}}}));
  assert.equal(one.count,1);
  assert.deepEqual(Object.keys(one.days[0]),['date','kcal','protein','fat','carbs']);
  const none=parseMonth('{"month":{}}');assert.equal(none.count,0);
  assert.throws(()=>parseMonth('{"error":{"code":"9"}}'),/fatsecret_api_denied/);
});
