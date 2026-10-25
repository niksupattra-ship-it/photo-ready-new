import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/promptpay-request.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad});return {promise,resolve,reject}};
let checked=0;
async function test(name,run){await run();checked++;console.log('PASS:',name)}
function fixture(){
 const timers=new Map(),calls=[];let timerId=0;
 const env={AbortController,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),fetch:(url,options)=>{const d=deferred();calls.push({url,options,...d});return d.promise}};
 const request=new Function('env',`with(env){${source.replace('export ','')};return requestPromptpay}`)(env);
 return {request,calls,timers,expire(){[...timers.values()].forEach(fn=>fn())}};
}
await test('a suspended fetch times out even if it ignores abort',async()=>{
 const e=fixture(),pending=e.request('/fixture');const rejected=assert.rejects(pending,{name:'TimeoutError'});e.expire();await rejected;assert.equal(e.calls[0].options.signal.aborted,true);assert.equal(e.timers.size,0);e.calls[0].resolve({ok:true,json:async()=>({status:'processing'})});await tick();
});
await test('the deadline also covers a suspended JSON response body',async()=>{
 const e=fixture(),body=deferred(),pending=e.request('/fixture');const rejected=assert.rejects(pending,{name:'TimeoutError'});e.calls[0].resolve({ok:true,json:()=>body.promise});await tick();e.expire();await rejected;body.resolve({ok:true,status:'succeeded'});await tick();assert.equal(e.timers.size,0);
});
await test('caller abort releases a suspended body read and ignores its late success',async()=>{
 const e=fixture(),controller=new AbortController(),body=deferred(),pending=e.request('/fixture',{signal:controller.signal});const rejected=assert.rejects(pending,{name:'AbortError'});e.calls[0].resolve({ok:true,json:()=>body.promise});await tick();controller.abort();await rejected;assert.equal(e.calls[0].options.signal.aborted,true);body.resolve({ok:true,status:'succeeded'});await tick();assert.equal(e.timers.size,0);
});
await test('an already canceled lifecycle never sends a request',async()=>{
 const e=fixture(),controller=new AbortController();controller.abort();await assert.rejects(e.request('/fixture',{signal:controller.signal}),{name:'AbortError'});assert.equal(e.calls.length,0);assert.equal(e.timers.size,0);
});
await test('successful status reads preserve headers/body and clear their deadline',async()=>{
 const e=fixture(),headers={'X-Wallet-Id':'fixture'},data={ok:true,status:'succeeded'},pending=e.request('/fixture',{headers,method:'POST',body:'fixture-body'});e.calls[0].resolve({ok:true,status:200,json:async()=>data});assert.equal((await pending).data,data);assert.equal(e.calls[0].options.headers,headers);assert.equal(e.calls[0].options.method,'POST');assert.equal(e.calls[0].options.body,'fixture-body');assert.equal(e.calls[0].options.cache,'no-store');assert.equal(e.timers.size,0);
});
await test('unreadable HTTP error bodies preserve the original error status',async()=>{
 const e=fixture(),pending=e.request('/fixture');e.calls[0].resolve({ok:false,status:503,json:async()=>{throw Error('HTML')}});const result=await pending;assert.equal(result.response.status,503);assert.equal(result.data,null);
});
await test('QR image reads return complete blobs and reject invalid successful JSON',async()=>{
 const e=fixture(),blob=new Blob(['fixture-qr']),image=e.request('/fixture/image',{read:'blob'});e.calls[0].resolve({ok:true,blob:async()=>blob});assert.equal((await image).data,blob);const malformed=e.request('/fixture');e.calls[1].resolve({ok:true,json:async()=>{throw new SyntaxError('invalid JSON')}});await assert.rejects(malformed,{name:'SyntaxError'});assert.equal(e.timers.size,0);
});
console.log(`PASS: ${checked} bounded PromptPay request scenarios; mocked fetch only.`);
