import test from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin,isAdmin,validPassword} from '../src/services/authSecurity.js';
process.env.APP_URL='https://itinerary.febro.id';
test('Safari same-origin Referer fallback never accepts foreign or null origins',()=>{
 assert.equal(sameOrigin({headers:{referer:process.env.APP_URL+'/login'}}),true);
 for(const headers of [{origin:'null',referer:process.env.APP_URL},{origin:'https://evil.invalid',referer:process.env.APP_URL},{referer:'https://itinerary.febro.id.evil.invalid'},{},{referer:process.env.APP_URL,'sec-fetch-site':'cross-site'}]) assert.equal(sameOrigin({headers}),false);
});
test('admin needs both allowlist and verified ownership bound to email',()=>{
 const u={role:'Administrator',email:' FEBROHERDYANTO98@gmail.com ',verified_email:'febroherdyanto98@gmail.com',email_verified_at:new Date()};
 assert.equal(isAdmin(u),true);
 for(const v of [{...u,email:'other@example.com'},{...u,email_verified_at:null},{...u,verified_email:'other@example.com'},{...u,role:'User'}]) assert.equal(isAdmin(v),false);
 assert.equal(validPassword('x'.repeat(73)),false);
});
