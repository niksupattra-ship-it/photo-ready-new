import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preparePurchasedWorkContext,restorePurchasedWorkProject} from '../src/purchased-work-context.js';
import {walletScope} from '../src/wallet-refresh.js';
const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const a=main.indexOf(' const restoreNativePurchasedEditor=async'),b=main.indexOf(' const startPurchasedEditorPrefetch=',a);
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
function fixture({english=false,original=true,fetcher}={}){
 let wallet='owner';const calls=[];
 const work='dwork_'+'a'.repeat(36),data={id:'photo_owned',workId:work,downloadWorkId:work,jobIds:['job_owned'],jobId:'job_owned',originalAvailable:original,originalSource:original?image:undefined,resultSource:image,job:{id:'job_owned',portraitMode:'male',hairId:'seedream-77',neckOutfitReferencePath:'/assets/job-uniforms/male-job-black-suit-silver-gray-tie.webp',...(english?{portraitComposition:'en-outfit-body-v1'}:{})}};
 const env={walletScope,authToken:()=>wallet+'-token',currentWalletId:()=>wallet,
  portraitFetch:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(data):{ok:true,json:async()=>data}},walletHeaders:()=>({Authorization:wallet+'-token','X-Wallet-Id':wallet}),
  preparePurchasedWorkContext,restorePurchasedWorkProject,ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',
  composePortrait:async(blob,adjust,template)=>{assert.equal(blob.idpromJobId,'job_owned');assert.equal(template,data.job.neckOutfitReferencePath);return{lock:{W:900,H:1200,uX:0,uY:600,uW:900,uH:600,templatePath:template}}},
  renderAdjustedFinal:async(...args)=>args.at(-1).push({name:'หัว · คอ · ผม',kind:'head',source:image,sourceFrame:{x:100,y:0,w:700,h:900}}),
  defaultPortraitBackground:()=>({src:'/assets/background.jpg'}),loadImage:async()=>({naturalWidth:1,naturalHeight:1}),canvasFor:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>image})};
 const open=Function('env',`with(env){${main.slice(a,b)};return restoreNativePurchasedEditor}`)(env);
 return {open,env,calls,data,switchAccount(){wallet='another-account'}};
}
test('stored editable snapshots retain their exact layers without native reconstruction or any network request',async()=>{
 const f=fixture(),work={project:{layers:[{kind:'head',source:'existing-manual-edits'}]},unlocked:true};assert.equal(await f.open(work,{id:'photo_owned'}),work);assert.equal(f.calls.length,0);
});
test('historical Thai and English archives restore native head geometry and owned canonical scope',async()=>{
 for(const english of [false,true]){const f=fixture({english}),work=await f.open({reconstructed:true},{id:'photo_owned'});assert.equal(f.calls[0].url,'/api/purchased-photos/photo_owned/edit');assert.equal(work.reconstructed,false);assert.equal(work.project.downloadWorkId,f.data.workId);assert.equal(work.project.canonicalInput,image);assert.deepEqual(work.project.layers.find(l=>l.kind==='head').sourceFrame,{x:100,y:0,w:700,h:900});assert.equal(work.project.layers.find(l=>l.kind==='suit').visible,!english);assert.equal(f.calls.length,1)}
});
test('a source-only paid photo keeps its aspect ratio without adding a generated head or suit',async()=>{
 const f=fixture();f.data.job.source_only=true;f.env.loadImage=async()=>({naturalWidth:1200,naturalHeight:800});f.env.composePortrait=async()=>assert.fail('Source-only photos must not be recomposed');
 const {project}=await f.open({reconstructed:true},{id:'photo_owned'});assert.equal(project.layers.length,1);const layer=project.layers[0];assert.equal(layer.kind,'source-photo');assert.equal(layer.jobId,'job_owned');assert.equal(layer.outputUnlocked,true);assert.deepEqual(layer.sourceFrame,{x:0,y:300,w:900,h:600});assert.equal(project.downloadWorkId,f.data.workId);
});
test('changing account during a native restore rejects before composing someone else’s work',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),f=fixture({fetcher:()=>pending});const opening=f.open({reconstructed:true},{id:'photo_owned'});f.switchAccount();resolve({ok:true,json:async()=>f.data});await assert.rejects(opening,/บัญชีเปลี่ยน/);
});
test('expiry, revoked access and storage failures never replace the supplied editable snapshot',async()=>{
 for(const status of [403,410,503]){const f=fixture({fetcher:async()=>({ok:false,status,json:async()=>({message:'fixture unavailable'})})}),work={reconstructed:true,project:{fixture:'untouched'}};await assert.rejects(f.open(work,{id:'photo_owned'}),/fixture unavailable/);assert.deepEqual(work.project,{fixture:'untouched'});}
});
