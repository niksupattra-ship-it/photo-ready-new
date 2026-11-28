import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FEMALE_LAB_PROCESS_VERSION} from '../female-portrait-prompt.js';
import {realUniformDetailsVersionFor,hasAdjustedRealUniformDetails} from '../src/real-uniform-details.js';
test('current female generated garment places two real shoulder boards and buttons once',async()=>{
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 const start=editor.indexOf(' const applyRealUniformDetails=async'),end=editor.indexOf(' useEffect(()=>{',start);
 const template='/assets/government-uniforms/female-operational.png',head={id:'head',jobId:'new-female-job',source:'original',generatedOutfitTemplate:template,hairReferenceContractVersion:FEMALE_LAB_PROCESS_VERSION};
 const parts=['left-board','right-board','buttons'].map(name=>({name,source:name,frame:{x:1,y:2,w:3,h:4}}));
 const key=JSON.stringify(['account',head.jobId,template]);let placed,hydrateCalls=0,id=0;
 const env={state:{current:[head]},governmentImageHead:head,governmentTemplate:template,accountScope:'account',realDetailEligible:true,ready:true,processActive:false,assetBusy:false,realDetailBusy:{current:false},editingPurchasedImage:false,savedWorkUnlocked:false,realDetailInitialJobs:{current:new Set()},realDetailMemory:{current:new Map([[key,{original:'original',result:{cleanedSource:'cleaned',parts,width:900,height:1200,regions:[]}}]])},realDetailSkip:{current:new Set()},assets:{current:new Map()},outputScopeRef:{current:'scope'},mounted:{current:true},historySnapshot:()=>env.state.current,realUniformDetailsVersionFor,hasAdjustedRealUniformDetails,headPose:()=>({}),fresh:part=>({id:'part-'+(++id),...part}),surfaceURL:s=>s,W:900,H:1200,hydrate:async layers=>{placed=layers;hydrateCalls++;return true},undo:{current:[]},redo:{current:[]},setAssetBusy:()=>{},setRevision:()=>{},setSelected:()=>{},setStatus:()=>{}};
 const apply=Function('env','with(env){'+editor.slice(start,end)+';return applyRealUniformDetails}')(env);
 await apply({automatic:true});assert.equal(hydrateCalls,1);assert.equal(placed[0].source,'cleaned');assert.equal(placed.filter(l=>l.realUniformDetail).length,3);
 assert.deepEqual(placed.filter(l=>l.realUniformDetail).map(l=>l.source),['left-board','right-board','buttons']);
 env.state.current=placed;await apply({automatic:true});assert.equal(hydrateCalls,1,'do not paste details a second time');
});
