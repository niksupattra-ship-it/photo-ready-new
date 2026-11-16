import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../src/purchased-editor-prefetch.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replaceAll('export function ','function ');
const project={format:'idprom-studio',version:1,layers:[{kind:'head',source:'data:image/png;base64,bmF0aXZl'}]};
function fixture(){
 const writes=[],events=[];let current='owner';
 const env={readPurchasedEditorCache:async()=>null,writePurchasedEditorCache:async row=>writes.push(row),prepareSavedProject:async p=>{events.push('prepare');return {project:p}},decodedStudioImage:async()=>({}),unpackSavedProjectTransfer:value=>value};
 const prefetch=Function('env',`with(env){${source};return prefetchPurchasedEditor}`)(env);
 const args={item:{id:'photo_owned',updatedAt:'2026-11-16T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'},scope:'owner',walletId:'wallet-owner',headers:()=>({Authorization:'owner'}),currentScope:()=>current,request:async()=>({ok:true,json:async()=>({reconstructed:true,project:{layers:[{source:'flattened-receipt'}]}})}),transformWork:async work=>{events.push('native');return {...work,project}}};
 return {prefetch,args,writes,events,env,switchAccount:()=>{current='foreign'}};
}
test('historical native recovery precedes cache writes and preparation; duplicate opens share the same work',async()=>{
 const f=fixture(),first=f.prefetch(f.args),second=f.prefetch(f.args);assert.equal(first,second);const work=await first;
 assert.equal(work.work.project,project);assert.equal(f.writes.length,1);assert.equal(f.writes[0].project,project);assert.deepEqual(f.events,['native','prepare']);
});
test('a native recovery failure never caches or prepares a flattened delivery image',async()=>{
 const f=fixture();f.args.transformWork=async()=>{throw Error('retryable storage failure')};await assert.rejects(f.prefetch(f.args),/retryable/);assert.equal(f.writes.length,0);assert.deepEqual(f.events,[]);
});
test('a delayed response after account change never reconstructs, caches or opens the prior account work',async()=>{
 const f=fixture();let resolve;const wait=new Promise(r=>resolve=r);f.args.request=async()=>wait;const opening=f.prefetch(f.args);await new Promise(r=>setImmediate(r));f.switchAccount();resolve({ok:true,json:async()=>({reconstructed:true})});assert.equal(await opening,null);assert.equal(f.writes.length,0);assert.deepEqual(f.events,[]);
});
test('valid existing snapshots from cache keep their manual layers and skip native/network recovery',async()=>{
 const f=fixture(),cached={...project,layers:[{kind:'head',source:'manual-snapshot'}]};
 f.args.request=async()=>assert.fail('Cached snapshots need no fetch');
 // A separate instance with its own cache dependency exercises the same module.
 const env={readPurchasedEditorCache:async()=>cached,writePurchasedEditorCache:async()=>assert.fail('No rewrite needed'),prepareSavedProject:async p=>({project:p}),decodedStudioImage:async()=>({}),unpackSavedProjectTransfer:value=>value};
 const prefetch=Function('env',`with(env){${source};return prefetchPurchasedEditor}`)(env);
 const result=await prefetch({...f.args,transformWork:async()=>assert.fail('Stored snapshots must remain unchanged')});assert.equal(result.work.project,cached);
});
test('editor prefetch negotiates a native response while retaining account headers and lossless transfer',async()=>{
 const f=fixture();f.args.request=async(path,options)=>{assert.equal(options.headers.Authorization,'owner');assert.equal(options.headers['X-IDPROM-Project-Transfer'],'images-v1');assert.equal(options.headers['X-IDPROM-Native-Recovery'],'1');return {ok:true,json:async()=>({project})}};
 await f.prefetch(f.args);
});
test('layer warming overlaps blob preparation only after the validation callback',async()=>{
 const f=fixture(),decoded=[];let release,validated=false;const gate=new Promise(resolve=>release=resolve);
 f.args.transformWork=async work=>({...work,project:{...project,layers:[...project.layers,{kind:'suit',source:'data:image/png;base64,c3VpdA=='},{kind:'background',source:'data:image/png;base64,Ymc='}]}});
 f.env.decodedStudioImage=async source=>{assert.equal(validated,true);decoded.push(source)};
 f.env.prepareSavedProject=async(p,options)=>{assert.equal(decoded.length,0);validated=true;options.onValidated(p);await gate;return {project:p}};
 const opening=f.prefetch(f.args);await new Promise(resolve=>setImmediate(resolve));assert.equal(decoded.length,3);release();assert(await opening);
});
