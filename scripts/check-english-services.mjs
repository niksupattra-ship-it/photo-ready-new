import assert from 'node:assert/strict';
import {registerPasswordResetApi} from '../password-reset-api.js';
import {registerPurchasedPhotoApi} from '../purchased-photo-api.js';
import {englishPhotoDeliveryPage} from '../english-photo-delivery.js';
import {translateEnglish,localizedLink,interfaceLocale} from '../src/english-preview.js';
const thai=/[\u0E00-\u0E7F]/;
assert.equal(localizedLink('/receive/abc',{href:'https://example.test/?lang=en',search:'?lang=en'}),'/receive/abc?lang=en');
assert.equal(localizedLink('/receive/abc',{href:'https://example.test/',search:''}),'/receive/abc');
assert.equal(interfaceLocale({search:'?lang=en'}),'en-GB');assert.equal(interfaceLocale({search:''}),'th-TH');
const app={routes:new Map(),post(path,...handlers){this.routes.set('POST '+path,handlers)},get(path,...handlers){this.routes.set('GET '+path,handlers)}};
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this},set(){return this},type(){return this},json(value){this.value=value;return this},send(value){this.value=value;return this},sendStatus(code){this.statusCode=code;return this}});
const previous={};for(const key of ['RESEND_API_KEY','PASSWORD_RESET_FROM','APP_URL']){previous[key]=process.env[key];process.env[key]=key==='APP_URL'?'https://example.test':key==='PASSWORD_RESET_FROM'?'test@example.test':'mock-only'}
const sent=[];
try{
 registerPasswordResetApi(app,{createPasswordReset:async email=>({email,token:'mock-token'}),resetPassword:async()=>({ok:true}),fetchImpl:async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true}}});
 const handler=app.routes.get('POST /api/auth/forgot-password').at(-1);
 for(const language of ['en','th']){const res=response();await handler({ip:'127.0.0.1',body:{email:'test@example.test',language}},res);assert.equal(res.value.ok,true)}
 assert(!thai.test(sent[0].subject+sent[0].text));assert(sent[0].text.includes('?lang=en#reset_password=mock-token'));assert(sent[0].text.includes('30 minutes'));
 assert(thai.test(sent[1].subject));assert(!sent[1].text.includes('?lang=en'));
}finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
const token='a'.repeat(64),row={id:'test',wallet_id:'fixture',job_ids:['fixture'],image:Buffer.from('mock-image'),expires_at:'2026-11-10T12:00:00Z'};
registerPurchasedPhotoApi(app,{store:{byToken:async()=>row},policy:{allowedJobs:async()=>true}});
const receive=app.routes.get('GET /receive/:token').at(-1);let res=response();await receive({params:{token},query:{lang:'en'}},res);
assert(!thai.test(res.value));assert(res.value.includes('<html lang="en">'));assert(res.value.includes('UTC+07:00'));assert(res.value.includes('lang=en&amp;download=1'));assert(res.value.includes('script nonce='));
row.expired=true;res=response();await receive({params:{token},query:{lang:'en'}},res);assert.equal(res.statusCode,410);assert(!thai.test(res.value));
res=response();await receive({params:{token},query:{}},res);assert(thai.test(res.value));
const escaped=englishPhotoDeliveryPage({imageUrl:'/receive/test/image',expiresAt:row.expires_at,nonce:'"<test>'});assert(!escaped.includes('nonce=""<test>'));
assert.equal(translateEnglish('1.5 นิ้ว'),'1.5 in');
console.log('PASS English delivery pages and expiry errors, English reset email and return link, Thai behavior retained, date locale and inch units. Email, storage, access and network mocked.');
