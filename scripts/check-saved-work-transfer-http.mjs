import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import http from 'node:http';
import crypto from 'node:crypto';
import {gzipSync,gunzipSync,brotliDecompressSync} from 'node:zlib';
import express from 'express';
import sharp from 'sharp';
import {TRANSFER_HEADER,TRANSFER_VERSION,packSavedProjectTransfer,unpackSavedProjectTransfer,getSavedWorkRequestSize} from '../src/saved-work-transfer.js';

// Execute the real routes, wire codec and HTTP compression, replacing only the DB.
const stub='data:text/javascript,'+encodeURIComponent('const fail=()=>{throw Error("unexpected production store call")};export const MAX_SAVED_WORKS=3,saveWork=fail,listWorks=fail,getWork=fail,deleteWork=fail,getSavedWorkRetentionPolicy=fail;');
const apiURL=new URL('../saved-work-api.js',import.meta.url),source=await readFile(apiURL,'utf8');
const code=source.replace(/from '\.\/saved-work-store\.js'/g,`from '${stub}'`).replace(/from '(\.\/(?:src\/saved-work-transfer|saved-work-response)\.js)'/g,(_,relative)=>`from '${new URL(relative,apiURL).href}'`);
assert.notEqual(code,source);
const {registerSavedWorkApi}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const cases=[],measurements=[];
const check=async(name,test)=>{await test();cases.push(name);console.log('PASS '+name)};
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>Object.assign(Error(message),{code:message});
const random=crypto.randomBytes(300*400*4);
const picture='data:image/png;base64,'+(await sharp(random,{raw:{width:300,height:400,channels:4}}).png().toBuffer()).toString('base64');
const mask='data:image/png;base64,'+(await sharp({create:{width:4,height:4,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toBuffer()).toString('base64');
const layer=(id,kind='head')=>({id,kind,name:kind==='head'?'หัว · คอ · ผม':'ชุด',jobId:'fixture-job',source:picture,processedOriginalSource:picture,mask,x:13,y:-29,scale:1.15,rotation:8,opacity:.85,visible:true,sourceFrame:{x:-128,y:-128,w:1156,h:1456}});
const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[layer('head'),{...layer('suit','suit'),collarParts:{left:picture,right:picture},collarLeftX:7,collarRightX:-3}],compareSource:picture,placement:{W:1800,H:2400,uX:0,uY:700,uW:1800,uH:1700},note:'ข้อมูลไทย 🔒 preserved',metadata:{unknown:'kept',nested:[1,true,null]}};
const original=clone(project),wire=packSavedProjectTransfer(project);
assert.equal(wire.format,'idprom-project-transfer');
const policy={days:45,version:'saved-work-45-v1',effectiveAt:'2026-10-24T11:38:45.873Z',legacyExpiresAt:'2026-12-08T11:38:45.873Z',serverNow:'2026-10-24T12:00:00.000Z'};
const work={id:'work_A',name:'รูป IDพร้อม',project,updated_at:'2026-10-24T12:00:00.000Z',retention_started_at:policy.effectiveAt,expires_at:policy.legacyExpiresAt,retention_policy_version:policy.version};
let currentWork=work,allow=true,mode='ok',rightsCalls=[],storeCalls=[],parseErrors=[];
const metadata={id:work.id,name:work.name,updated_at:work.updated_at,expires_at:work.expires_at};
const store={MAX_SAVED_WORKS:3,
 async getSavedWorkRetentionPolicy(){return policy},
 async listWorks(wallet){storeCalls.push(['list',wallet]);return wallet==='wallet_A'?[metadata]:[]},
 async getWork(wallet,id){storeCalls.push(['get',wallet,id]);if(mode==='expired')throw fail('saved_work_expired');return wallet==='wallet_A'&&id==='work_A'?currentWork:null},
 async saveWork(wallet,id,value){storeCalls.push(['save',wallet,id,value]);if(mode==='expired')throw fail('saved_work_expired');return wallet==='wallet_A'&&(id===''||id==='work_A')?metadata:null},
 async deleteWork(){throw Error('test must never delete a work')}
};
const app=express();
app.use('/api/saved-work',express.json({limit:'64mb'}));
app.use((req,res,next)=>{const account=req.get('X-Test-Account');if(account==='A'||account==='B')req.accountUser={wallet_id:'wallet_'+account};next()});
registerSavedWorkApi(app,{store,savedWorkRights:async(wallet,value)=>{rightsCalls.push([wallet,value]);if(mode==='rights-error')throw Error('fixture rights failure');return allow}});
app.use((error,req,res,next)=>{parseErrors.push(error.type);res.set('Cache-Control','no-store').status(error.status||500).json({error:error.type||'fixture_error'})});
const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');
const port=server.address().port;
async function request(path,{method='GET',account='A',body,raw,encoding='identity',headers={}}={}){
 const payload=raw??(body===undefined?undefined:Buffer.from(JSON.stringify(body)));
 const values={'X-Wallet-Id':'spoofed_wallet_B',...headers};
 if(account)values['X-Test-Account']=account;
 if(encoding!==null)values['Accept-Encoding']=encoding;
 if(payload!==undefined){values['Content-Type']='application/json';values['Content-Length']=payload.length}
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,path,method,headers:values},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>{
    try{
     const raw=Buffer.concat(chunks),encoding=res.headers['content-encoding'];
     const decoded=encoding==='gzip'?gunzipSync(raw):encoding==='br'?brotliDecompressSync(raw):raw;
     resolve({status:res.statusCode,headers:res.headers,raw,decoded,data:JSON.parse(decoded.toString('utf8'))});
    }catch(error){reject(error)}
   });
  });req.setTimeout(15000,()=>req.destroy(Error('local HTTP check timed out')));req.on('error',reject);req.end(payload);
 });
}
const reset=()=>{rightsCalls=[];storeCalls=[];parseErrors=[];mode='ok';allow=true;currentWork=work};
const assertPrivate=response=>{assert.equal(response.headers['cache-control'],'no-store');assert.match(response.headers['content-type'],/^application\/json/)};
const expectedOpen=()=>({...work,unlocked:true});
try{
 await check('legacy JSON saves still pass exact editable project and account wallet to the store',async()=>{
  reset();const response=await request('/api/saved-work',{method:'POST',body:{id:'work_A',project}});assert.equal(response.status,200);assertPrivate(response);
  assert.deepEqual(response.data,metadata);assert.deepEqual(rightsCalls,[['wallet_A',project]]);assert.deepEqual(storeCalls,[['save','wallet_A','work_A',project]]);assert.deepEqual(project,original);
 });
 await check('packed uploads are expanded losslessly before rights checks and storage',async()=>{
  reset();const response=await request('/api/saved-work',{method:'POST',body:{id:'work_A',project:wire}});assert.equal(response.status,200);assertPrivate(response);
  assert.equal(rightsCalls.length,1);assert.deepEqual(rightsCalls[0],['wallet_A',original]);assert.equal(storeCalls[0][3].format,'idprom-studio');assert.deepEqual(storeCalls[0][3],original);assert.deepEqual(wire,packSavedProjectTransfer(original));
 });
 await check('gzip legacy requests are inflated by existing Express JSON middleware without changing project bytes',async()=>{
  reset();const json=Buffer.from(JSON.stringify({id:'work_A',project})),compressed=gzipSync(json,{level:1});
  const response=await request('/api/saved-work',{method:'POST',raw:compressed,headers:{'Content-Encoding':'gzip'}});assert.equal(response.status,200);assert.deepEqual(storeCalls[0][3],original);assert.deepEqual(rightsCalls[0][1],original);
  measurements.push({kind:'legacy-gzip-upload',jsonBytes:json.length,wireBytes:compressed.length});
 });
 await check('packed plus gzip requests preserve all native image, mask, restore and geometry fields',async()=>{
  reset();const full={...original,layers:original.layers.map(value=>({...value,warpSource:picture,warpBaseMask:mask,eraseRestoreSource:picture,warpRestoreBase:mask,makeupBaseSource:picture,makeupFullSource:picture,hairOriginalSource:picture}))};
  const packed=packSavedProjectTransfer(full),json=Buffer.from(JSON.stringify({id:'work_A',project:packed}));
  const response=await request('/api/saved-work',{method:'POST',raw:gzipSync(json,{level:1}),headers:{'Content-Encoding':'gzip'}});assert.equal(response.status,200);assert.deepEqual(storeCalls[0][3],full);assert.deepEqual(rightsCalls[0][1],full);
 });
 await check('legacy GET keeps the original v1 response and all metadata when transfer was not requested',async()=>{
  reset();const response=await request('/api/saved-work/work_A');assert.equal(response.status,200);assertPrivate(response);assert.deepEqual(response.data,expectedOpen());assert(!response.headers[TRANSFER_HEADER.toLowerCase()]);assert(!response.headers['content-encoding']);
  assert.deepEqual(storeCalls,[['get','wallet_A','work_A']]);assert.deepEqual(rightsCalls,[['wallet_A',original]]);assert.deepEqual(work.project,original);
 });
 await check('opt-in GET sends a compact envelope while keeping dates, rights and exact original project recoverable',async()=>{
  reset();const response=await request('/api/saved-work/work_A',{headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(response.status,200);assertPrivate(response);assert.equal(response.headers[TRANSFER_HEADER.toLowerCase()],TRANSFER_VERSION);
  assert.equal(response.data.project.format,'idprom-project-transfer');assert.deepEqual(unpackSavedProjectTransfer(response.data.project),original);assert.deepEqual({...response.data,project:original},expectedOpen());
  assert.match(response.headers.vary,/X-IDPROM-Project-Transfer/i);assert.match(response.headers.vary,/Accept-Encoding/i);
  const plain=Buffer.byteLength(JSON.stringify(expectedOpen()));assert(response.raw.length<plain*.4);measurements.push({kind:'deduplicated-identity-open',expandedBytes:plain,wireBytes:response.raw.length});
 });
 await check('unknown transfer versions fall back to legacy GET rather than breaking old clients',async()=>{
  reset();const response=await request('/api/saved-work/work_A',{headers:{[TRANSFER_HEADER]:'images-v99'}});assert.equal(response.status,200);assert.deepEqual(response.data,expectedOpen());assert(!response.headers[TRANSFER_HEADER.toLowerCase()]);
 });
 for(const [label,accept,expected] of [['gzip','gzip, br;q=0','gzip'],['Brotli','br, gzip;q=0','br'],['quality preference','gzip;q=1, br;q=0.4, identity;q=0.1','gzip']]){
  await check('GET negotiates '+label+' and decompresses to the exact legacy JSON',async()=>{
   reset();const response=await request('/api/saved-work/work_A',{encoding:accept});assert.equal(response.status,200);assertPrivate(response);assert.equal(response.headers['content-encoding'],expected);assert.deepEqual(response.data,expectedOpen());assert(response.raw.length<response.decoded.length);
   measurements.push({kind:'legacy-'+expected+'-open',decodedBytes:response.decoded.length,wireBytes:response.raw.length});
  });
 }
 await check('packed GET also negotiates Brotli without changing the lossless wire envelope',async()=>{
  reset();const response=await request('/api/saved-work/work_A',{encoding:'br',headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(response.status,200);assert.equal(response.headers['content-encoding'],'br');assert.deepEqual(unpackSavedProjectTransfer(response.data.project),original);assertPrivate(response);
  measurements.push({kind:'deduplicated-br-open',expandedBytes:Buffer.byteLength(JSON.stringify(expectedOpen())),packedBytes:response.decoded.length,wireBytes:response.raw.length});
 });
 await check('disabled or missing compression support retains a usable identity response',async()=>{
  reset();for(const encoding of ['gzip;q=0, br;q=0, identity;q=1',null]){const response=await request('/api/saved-work/work_A',{encoding});assert.equal(response.status,200);assert(!response.headers['content-encoding']);assert.deepEqual(response.data,expectedOpen());assertPrivate(response)}
 });
 await check('small saved works skip compression overhead even when Brotli is accepted',async()=>{
  reset();const tinyProject={...original,layers:[{...layer('head'),source:mask,processedOriginalSource:mask}],compareSource:mask};currentWork={...work,project:tinyProject};
  const response=await request('/api/saved-work/work_A',{encoding:'br'});assert.equal(response.status,200);assert(!response.headers['content-encoding']);assert.deepEqual(response.data.project,tinyProject);reset();
 });
 await check('malformed references and versions are rejected before rights or store calls',async()=>{
  const mutations=[value=>{value.version=99},value=>{value.project.layers[0].source={$image:999}},value=>{value.project.layers[0].source={$image:.5}},value=>{value.project.layers[0].source=JSON.parse('{"$image":0,"__proto__":{"polluted":true}}')},value=>{value.images.push(mask+'AAAA')}];
  for(const mutate of mutations){reset();const invalid=clone(wire);mutate(invalid);const response=await request('/api/saved-work',{method:'POST',body:{id:'work_A',project:invalid}});assert.equal(response.status,400);assertPrivate(response);assert.equal(rightsCalls.length,0);assert.equal(storeCalls.length,0);assert(!JSON.stringify(response.data).includes('data:image/'));assert.equal(Object.prototype.polluted,undefined)}
 });
 await check('expanded requests above 64 MiB are rejected even when the wire body is small',async()=>{
  reset();const large='data:image/png;base64,'+'A'.repeat(2*1024*1024),largeWire={format:'idprom-project-transfer',version:1,images:[large],project:{format:'idprom-studio',version:1,width:900,height:1200,layers:Array.from({length:20},(_,i)=>({...layer('head_'+i),source:{$image:0},processedOriginalSource:{$image:0},mask:null})),compareSource:null}};
  assert.throws(()=>getSavedWorkRequestSize('work_A',largeWire),error=>error.code==='saved_work_too_large');
  const raw=Buffer.from(JSON.stringify({id:'work_A',project:largeWire}));assert(raw.length<3*1024*1024);
  const response=await request('/api/saved-work',{method:'POST',raw:gzipSync(raw),headers:{'Content-Encoding':'gzip'}});assert.equal(response.status,413);assert.equal(response.data.error,'saved_work_too_large');assert.equal(rightsCalls.length,0);assert.equal(storeCalls.length,0);assertPrivate(response);
 });
 await check('the existing 64 MiB JSON limit applies after gzip inflation, before the saved-work handler',async()=>{
  reset();const compressed=gzipSync(Buffer.alloc(64*1024*1024+1,0x20),{level:1});assert(compressed.length<1024*1024);
  const response=await request('/api/saved-work',{method:'POST',raw:compressed,headers:{'Content-Encoding':'gzip'}});assert.equal(response.status,413);assert.equal(response.data.error,'entity.too.large');assert.equal(rightsCalls.length,0);assert.equal(storeCalls.length,0);assert.deepEqual(parseErrors,['entity.too.large']);assertPrivate(response);
 });
 await check('unknown metadata and prototype-named JSON properties survive as data without pollution',async()=>{
  reset();const full=clone(original);full.metadata=JSON.parse('{"__proto__":{"fixture":true},"constructor":"data","ข้อความ":"ไทย"}');
  const response=await request('/api/saved-work',{method:'POST',body:{id:'work_A',project:packSavedProjectTransfer(full)}});assert.equal(response.status,200);assert.deepEqual(storeCalls[0][3],full);assert.equal(Object.getPrototypeOf(storeCalls[0][3].metadata),Object.prototype);assert.equal(Object.prototype.fixture,undefined);
 });
 await check('authentication and authoritative rights still reject both transfer and legacy operations',async()=>{
  reset();for(const method of ['GET','POST']){
   const path=method==='GET'?'/api/saved-work/work_A':'/api/saved-work';const response=await request(path,{method,account:null,body:method==='POST'?{id:'work_A',project:wire}:undefined,headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(response.status,401);assertPrivate(response);
  }assert.equal(storeCalls.length,0);assert.equal(rightsCalls.length,0);
  allow=false;for(const method of ['GET','POST']){const response=await request(method==='GET'?'/api/saved-work/work_A':'/api/saved-work',{method,body:method==='POST'?{id:'work_A',project:wire}:undefined,headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(response.status,403);assertPrivate(response)}assert(!storeCalls.some(value=>value[0]==='save'));
 });
 await check('cross-account and expired work cannot use the compact transfer route to bypass access',async()=>{
  reset();const other=await request('/api/saved-work/work_A',{account:'B',headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(other.status,404);assert.equal(rightsCalls.length,0);assert.deepEqual(storeCalls,[['get','wallet_B','work_A']]);
  mode='expired';for(const method of ['GET','POST']){const response=await request(method==='GET'?'/api/saved-work/work_A':'/api/saved-work',{method,body:method==='POST'?{id:'work_A',project:wire}:undefined,headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(response.status,410);assert.equal(response.data.error,'saved_work_expired');assert(!response.data.project);assertPrivate(response)}
 });
 await check('rights failures do not overwrite a work and all fixture expiry dates remain unchanged',async()=>{
  reset();mode='rights-error';const before=clone(work);
  const saved=await request('/api/saved-work',{method:'POST',body:{id:'work_A',project:wire}});assert.equal(saved.status,400);assert(!storeCalls.some(value=>value[0]==='save'));
  const opened=await request('/api/saved-work/work_A',{headers:{[TRANSFER_HEADER]:TRANSFER_VERSION}});assert.equal(opened.status,500);assert.deepEqual(work,before);assert.deepEqual(project,original);
 });
 const report={passed:cases.length,cases,measurements,scope:'Actual Express HTTP routes, lossless image transfer codec and Node gzip/Brotli, injected local account/store fixtures only; no production DB/account/payment/AI calls'};
 await writeFile(process.env.SAVED_WORK_TRANSFER_HTTP_REPORT||'/tmp/idprom-saved-work-transfer-http-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
