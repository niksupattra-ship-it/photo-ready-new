import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {openaiApiKey} from '../openai-api-key.js';
import {sanitizeAiError,sanitizedAiJob} from '../ai-error-sanitizer.js';
import {openaiReadiness} from '../openai-readiness.js';
import {requestOpenAIPortrait} from '../openai-portrait-transport.js';
import {portraitProviderFor} from '../portrait-provider-policy.js';
const fake='sk-proj-test_credential_NOT_REAL_123456789',other='not-real-second-secret';
const pasted=fake+'"\nREMOVEBG_API_KEY="'+other+'"';
test('the exact pasted dotenv failure shape produces one valid Authorization header',async()=>{
 const png=await sharp({create:{width:2,height:2,channels:4,background:'#888'}}).png().toBuffer();let calls=0;
 const p=portraitProviderFor({portraitMode:'female'},{OPENAI_API_KEY:pasted});assert.equal(p.key,fake);
 const r=await requestOpenAIPortrait({key:pasted,prompt:'Original unchanged instructions',portrait:png},{fetchImpl:async(_url,init)=>{calls++;const headers=new Headers(init.headers);assert.equal(headers.get('Authorization'),'Bearer '+fake);assert(!headers.get('Authorization').includes(other));return {ok:true,status:200,headers:{get:()=>null},json:async()=>({output:[{type:'image_generation_call',status:'completed',result:png.toString('base64')}]})}}});assert(r.png.equals(png));assert.equal(calls,1);
});
test('bare, quoted and named dotenv keys normalize without executing or printing trailing assignments',()=>{
 for(const raw of [fake,' '+fake+' ',`"${fake}"`,`'${fake}'`,`OPENAI_API_KEY="${fake}"`,pasted,`OPENAI_API_KEY='${fake}'\r\nOTHER_TOKEN=ignored`])assert.equal(openaiApiKey(raw),fake);
 for(const raw of ['',null,'Bearer '+fake,'bad\tkey','invalid value with spaces'])assert.throws(()=>openaiApiKey(raw),e=>e.code.startsWith('openai_')&&!e.message.includes(fake));
});
test('an unexpected transport exception cannot leak credentials into a job error or stack',async()=>{
 await assert.rejects(requestOpenAIPortrait({key:pasted,prompt:'same',portrait:Buffer.from('png')},{fetchImpl:async()=>{throw Error('Headers.append Bearer '+pasted)}}),e=>e.code==='openai_transport_failed'&&!String(e.stack).includes(fake)&&!String(e.stack).includes(other));
});
test('even a transport error with a known provider code is rebuilt with sanitized text',async()=>{
 await assert.rejects(requestOpenAIPortrait({key:pasted,prompt:'same',portrait:Buffer.from('png')},{fetchImpl:async()=>{throw Object.assign(Error('Bearer '+pasted),{code:'openai_failed',status:500})}}),e=>e.code==='openai_failed'&&!String(e.stack).includes(fake)&&!String(e.stack).includes(other));
});
test('historical job errors are redacted without changing result, ownership or status',()=>{
 const error='Headers.append: "Bearer '+pasted+' is an invalid header value';const row={status:'failed',usage_id:'same-usage',result:Buffer.from('same pixels'),error};
 const cleaned=sanitizedAiJob(row);assert(!cleaned.error.includes(fake));assert(!cleaned.error.includes(other));assert.match(cleaned.error,/REDACTED/);assert.equal(cleaned.result,row.result);assert.equal(cleaned.status,row.status);assert.equal(cleaned.usage_id,row.usage_id);assert.equal(row.error,error);assert.equal(sanitizedAiJob(null),null);
 assert(!sanitizeAiError('CUSTOM_SECRET="'+other+'"').includes(other));
});
test('model readiness makes read-only authenticated requests with a cleaned key and safe statuses',async()=>{
 const calls=[];const r=await openaiReadiness(pasted,{fetchImpl:async(url,init)=>{calls.push(url);assert(url.startsWith('https://api.openai.com/v1/models/'));assert.equal(new Headers(init.headers).get('Authorization'),'Bearer '+fake);assert(!init.body);return {status:200,ok:true}}});assert.equal(r.state,'ready');assert.equal(r.keyNormalized,true);assert.equal(calls.length,2);assert(!JSON.stringify(r).includes(fake));assert(!JSON.stringify(r).includes(other));
 const denied=await openaiReadiness(fake,{fetchImpl:async()=>({status:401,ok:false})});assert.equal(denied.state,'unavailable');assert(denied.models.every(m=>m.status===401));
 const missing=await openaiReadiness('');assert.equal(missing.state,'unconfigured');
});
test('database writes and reads, worker logs and response paths all sanitize errors',async()=>{
 const store=await readFile(new URL('../job-store.js',import.meta.url),'utf8'),server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 for(const name of ['getAiJob','getAiJobResult']){const a=store.indexOf('export async function '+name+'('),b=store.indexOf('\n',a);assert(store.slice(a,b).includes('sanitizedAiJob(rows[0])'))}
 const a=store.indexOf('export async function failAiJob('),b=store.indexOf('\n',a);let stored;
 const save=Function('env','with(env){'+store.slice(a,b).replace('export ','')+';return failAiJob}')({ready:async()=>{},pool:{query:async(_q,args)=>{stored=args}},sanitizeAiError});await save('same-job',pasted);assert.equal(stored[0],'same-job');assert(!stored[1].includes(fake));assert(!stored[1].includes(other));
 assert(server.includes("console.error('Combined portrait:',sanitizeAiError(e.message))"));assert(server.includes('openaiPortrait:openaiPortraitStatus'));assert(server.includes('process.env.OPENAI_API_KEY=openaiApiKey(originalOpenaiSetting)'));
});
