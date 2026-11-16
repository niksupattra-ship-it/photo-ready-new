import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePurchasedWorkContext,buildPurchasedWorkProject} from '../src/purchased-work-context.js';
const image='data:image/png;base64,iVBORw0KGgo=';
const dwork='dwork_'+'a'.repeat(36),head={name:'หัว · คอ · ผม',source:image,sourceFrame:{x:140,y:80,w:620,h:840}};
const payload={id:'photo_fixture',workId:dwork,jobId:'job_original',jobIds:['job_original','job_hair2'],originalAvailable:true,originalSource:image,resultSource:image,makeupSource:image,packageId:'159',expiresAt:'2099-01-01T00:00:00Z',job:{id:'job_original',portraitMode:'female',hairId:'seedream-42',femaleEyeStyle:'natural',neckOutfitReferencePath:'/assets/job-uniforms/example.png',portraitComposition:'en-outfit-body-v1'}};
test('a reopened paid work retains its server-owned source and work anchor, not the receipt image',async()=>{
 const context=preparePurchasedWorkContext(payload);
 assert.equal(context.sourceFile.idpromDownloadWorkId,dwork);assert.equal(context.sourceFile.idpromCanonicalInput,context.sourceFile);assert.equal(context.jobId,'job_original');assert.equal(context.sourceFile.idpromPortraitMode,'female');
 assert.notEqual(context.sourceFile,context.resultBlob);assert.equal(context.resultBlob.idpromPortraitComposition,'en-outfit-body-v1');
 assert.equal(context.resultBlob.idpromAiMakeupSource,image);assert(context.makeupBlob instanceof Blob);
 const project=buildPurchasedWorkProject(context,{layers:[head],placement:{W:900,H:1200}});
 assert.equal(project.downloadWorkId,dwork);assert.equal(project.downloadSource,image);assert.equal(project.canonicalInput,image);assert.equal(project.layers[0].jobId,'job_original');assert.equal(project.layers[0].hairId,'seedream-42');assert.deepEqual(project.layers[0].sourceFrame,head.sourceFrame);
});
test('legacy paid renders without a verified original cannot manufacture an original or dwork ID',()=>{
 const context=preparePurchasedWorkContext({...payload,workId:'job:job_original',originalAvailable:false,originalSource:image});
 assert.equal(context.sourceFile,null);assert.equal(context.originalSource,null);assert.equal(context.downloadWorkId,null);
 const project=buildPurchasedWorkProject(context,{layers:[head]});assert.equal(project.compareSource,null);assert(!('downloadSource'in project));assert(!('downloadWorkId'in project));
});
test('source replacement produces an unrelated file with no inherited purchased-work expando',()=>{
 const original=preparePurchasedWorkContext(payload).sourceFile,newPhoto=new File([image],'new.png',{type:'image/png'});
 assert(original.idpromDownloadWorkId);assert.equal(newPhoto.idpromDownloadWorkId,undefined);
});
test('native restoration retains the server single-finish protocol needed for the existing free alternate finish',()=>{
 const context=preparePurchasedWorkContext({...payload,job:{...payload.job,femaleFinishSingleVersion:'female-single-finish-v1'}});
 assert.equal(context.resultBlob.idpromFemaleFinishSingleVersion,'female-single-finish-v1');
 const project=buildPurchasedWorkProject(context,{layers:[head]});assert.equal(project.layers[0].femaleFinishSingleVersion,'female-single-finish-v1');
});
test('work-scope IDs are not saved-studio IDs and malformed source URLs are refused',()=>{
 const context=preparePurchasedWorkContext(payload);assert.equal(context.workScope,dwork);assert.equal(context.savedWorkId,undefined);
 assert.throws(()=>preparePurchasedWorkContext({...payload,originalSource:'https://other.invalid/photo.png'}));
 assert.throws(()=>preparePurchasedWorkContext({...payload,resultSource:'https://other.invalid/result.png'}));
 assert.throws(()=>preparePurchasedWorkContext({...payload,jobId:'another-customer'}));
});
test('expired paid-photo responses are rejected and Thai layer geometry is never fabricated',()=>{
 assert.throws(()=>preparePurchasedWorkContext({...payload,expiresAt:'2020-01-01T00:00:00Z',serverNow:'2026-11-15T00:00:00Z'}),/7 วัน/);
 assert(preparePurchasedWorkContext({...payload,expiresAt:'2020-01-01T00:00:00Z'}),'An authenticated server response remains authoritative when no server clock is supplied');
 assert.throws(()=>buildPurchasedWorkProject(preparePurchasedWorkContext(payload)),/เลเยอร์/);
});
