import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import express from 'express';
import sharp from 'sharp';
import {registerSavedWorkApi} from '../saved-work-api.js';
import {normalizeSavedProjectMasks,assertSavedProjectResources} from '../src/saved-project.js';
import {packSavedProjectTransfer} from '../src/saved-work-transfer.js';
const picture=async(width,height,color)=>'data:image/png;base64,'+(await sharp({create:{width,height,channels:4,background:color}}).png().toBuffer()).toString('base64');
const layer=async(kind,width,height,color)=>({id:kind,kind,name:kind,jobId:kind==='head'?'paid-fixture':undefined,source:await picture(width,height,color),mask:await picture(width,height,'white'),sourceFrame:{x:0,y:0,w:900,h:1200},x:0,y:0,scale:1,rotation:0,opacity:1,visible:true});
const layers=await Promise.all([layer('head',1984,2256,'#315d7b'),layer('background',1128,1536,'#abcdee'),layer('suit',1504,1285,'#cdbdac'),layer('collar',2312,2912,'#516273')]);
layers[3].collarParts={left:await picture(2312,2912,'#627384'),right:await picture(2312,2912,'#738495')};
const legacy={format:'idprom-studio',version:1,width:900,height:1200,layers};
const inspectMask=async source=>{const rgba=await sharp(Buffer.from(source.split(',')[1],'base64')).ensureAlpha().raw().toBuffer();for(let i=3;i<rgba.length;i+=4)if(rgba[i]!==255)return false;return true};
assert.throws(()=>assertSavedProjectResources(legacy),{code:'PROJECT_RESOURCE_LIMIT'});
const normalized=await normalizeSavedProjectMasks(legacy,{inspectMask});assertSavedProjectResources(normalized);
let canSave=true,saves=0,rightsCalls=0,limit=false;
const app=express();app.use(express.json({limit:'64mb'}));app.use((req,res,next)=>{req.accountUser={wallet_id:'wallet_fixture'};next()});
registerSavedWorkApi(app,{downloadPolicy:{summary:async()=>({canSave}),isLegacySaved:async()=>false},savedWorkRights:async()=>{rightsCalls++;return true},store:{MAX_SAVED_WORKS:3,saveWork:async(wallet,id,project)=>{saves++;if(limit)throw Object.assign(Error('limit'),{code:'saved_work_limit'});return{id:'work_fixture'}},getWork:async()=>({id:'work_fixture',project:legacy})}});
const server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
const post=async project=>{const r=await fetch(base+'/api/saved-work',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project})});return{status:r.status,data:await r.json()}};
try{
 for(const input of [legacy,packSavedProjectTransfer(legacy)]){const before=saves,result=await post(input);assert.equal(result.status,413);assert.equal(result.data.error,'PROJECT_RESOURCE_LIMIT');assert.equal(saves,before)}
 console.log('PASS oversized legacy and packed saves fail before storage; no false success');
 assert.equal((await post(normalized)).status,200);assert.equal(saves,1);console.log('PASS normalized native collar project saves successfully');
 const get=await fetch(base+'/api/saved-work/work_fixture');assert.equal(get.status,200);assert.deepEqual((await get.json()).project,JSON.parse(JSON.stringify(legacy)));console.log('PASS old affected GET stays readable for client normalization');
 canSave=false;const rightsBefore=rightsCalls;assert.equal((await post(normalized)).status,403);assert.equal(saves,1);assert.equal(rightsCalls,rightsBefore);console.log('PASS accounts without saving stay denied before rights/storage');
 canSave=true;limit=true;const result=await post(normalized);assert.equal(result.status,409);assert.equal(result.data.limit,3);console.log('PASS enabled accounts keep the existing three-work limit');
}finally{server.close();server.closeAllConnections();await once(server,'close')}
