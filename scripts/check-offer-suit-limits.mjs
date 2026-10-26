import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STUDIO_ACCESSORY_PLACEMENT} from '../src/studio-accessory-placement.js';

// Execute the actual Studio handler. Only image decoding/hydration and the
// policy API are local doubles; no provider, account or database is contacted.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const a=editor.indexOf(' const selectAsset=async(kind,option)=>{'),b=editor.indexOf('\n const openBackgroundColor=',a);
assert(a>=0&&b>a,'missing actual selectAsset handler');
const limit=editor.match(/ const suitChoiceLimit=[^;]+;/)?.[0];assert(limit,'missing API limit reader');
const disabled=editor.match(/disabled=\{(assetBusy\|\|!ready\|\|\(picker==='suit'&&suitPolicy\.limited&&suitPolicy\.choices\.length>=[^}]+)\}/)?.[1];
assert(disabled,'missing actual suit catalog disable expression');
const render=new Function('env',`with(env){${limit}${editor.slice(a,b)};return {selectAsset,catalogDisabled:option=>{const o=option;return ${disabled}},limit:suitChoiceLimit}}`);
const noop=()=>{};
function fixture({limit=3,count=0,limited=true,serverError=false,nativeError=false}={}){
 const head={id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'job_current',source:'head pixels',x:12,y:-4,scale:1.1,rotation:2};
 const suit={id:'suit',kind:'suit',name:'ชุด',templatePath:'/s1',assetId:'s1',source:'old suit pixels',x:8,y:10,scale:1,rotation:0,locked:false};
 const background={id:'background',kind:'background',source:'background pixels'};
 const original=[background,head,suit],messages=[],native=[],api=[],hydrations=[],selections=[];
 const env={ready:true,assetBusy:false,processActive:false,comparing:false,suitPolicy:{limited,limit,choices:Array.from({length:count},(_,i)=>'/s'+(i+1))},picker:'suit',
  state:{current:original},layerKind:l=>l.kind,ASSET_NAMES:{suit:'ชุด',background:'พื้นหลัง'},STUDIO_ACCESSORY_PLACEMENT,W:900,H:1200,
  canUseAllSuits:true,freeTemplatePaths:[],placementRef:{current:{W:900,H:1200,uX:0,uY:300,uW:900,uH:900}},
  setAssetBusy:value=>{env.assetBusy=value},setStatus:message=>messages.push(message),setSuitPolicy:policy=>{env.suitPolicy=policy},
  trackUniformSelection:(...args)=>selections.push(args),flushTransforms:noop,historySnapshot:()=>env.state.current,
  fresh:layer=>({id:'new-layer',...layer}),outputHeads:layers=>layers.filter(l=>l.kind==='head'),
  nativeAsset:async(kind,option,frame,preset)=>{native.push({kind,option,frame,preset});if(nativeError)throw Error('native failure');return{source:'native pixels '+option.template,sourceFrame:frame}},
  hydrate:async(layers,unchangedIds)=>{hydrations.push({layers,unchangedIds});env.state.current=layers;return true},
  onSelectSuit:async(jobId,templates)=>{api.push({jobId,templates});if(serverError)throw Error('server denied current suit');return{limited,limit,choices:[...new Set([...env.suitPolicy.choices,...templates])]}},
  undo:{current:[]},redo:{current:[]},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},
  setSelected:noop,setRevision:noop
 };
 return {env,head,suit,background,original,messages,native,api,hydrations,selections,render:()=>render(env)};
}
let passed=0;
async function check(name,run){await run();passed++;console.log('PASS '+name)}

for(const policyLimit of [3,5]){
 await check(`${policyLimit}-suit offer rejects its next new choice before native work or API calls`,async()=>{
  const f=fixture({limit:policyLimit,count:policyLimit}),view=f.render(),option={id:'next',template:'/s'+(policyLimit+1)};
  assert.equal(view.catalogDisabled(option),true);await view.selectAsset('suit',option);
  assert.equal(f.env.state.current,f.original);assert.equal(f.native.length,0);assert.equal(f.api.length,0);assert.equal(f.hydrations.length,0);assert.equal(f.env.undo.current.length,0);assert.equal(f.env.assetBusy,false);
  assert.equal(f.messages.length,1);assert(f.messages[0].includes(`ครบ ${policyLimit} ชุด`));
 });
 await check(`${policyLimit}-suit offer permits the final allowed choice and sends actual job/templates`,async()=>{
  const f=fixture({limit:policyLimit,count:policyLimit-1}),view=f.render(),path='/s'+policyLimit,option={id:'selected',template:path};
  assert.equal(view.catalogDisabled(option),false);await view.selectAsset('suit',option);
  assert.equal(f.native.length,1);assert.equal(f.native[0].kind,'suit');assert.equal(f.native[0].option,option);assert.deepEqual(f.api,[{jobId:'job_current',templates:['/s1',path]}]);
  assert.equal(f.env.state.current.find(l=>l.id==='suit').templatePath,path);assert.equal(f.env.state.current.find(l=>l.id==='head'),f.head);assert.equal(f.env.state.current.find(l=>l.id==='background'),f.background);
  assert.equal(f.env.suitPolicy.limit,policyLimit);assert.equal(f.env.suitPolicy.choices.length,policyLimit);assert.equal(f.env.undo.current[0],f.original);assert.equal(f.env.assetBusy,false);assert(f.selections.some(([,stage])=>stage==='apply'));
 });
 await check(`${policyLimit}-suit offer can return to an existing choice at its cap`,async()=>{
  const f=fixture({limit:policyLimit,count:policyLimit}),view=f.render(),option={id:'known',template:'/s2'};
  assert.equal(view.catalogDisabled(option),false);await view.selectAsset('suit',option);
  assert.equal(f.native.length,1);assert.deepEqual(f.api,[{jobId:'job_current',templates:['/s1','/s2']}]);assert.equal(f.env.suitPolicy.choices.length,policyLimit);assert.equal(f.env.state.current.find(l=>l.id==='suit').templatePath,'/s2');
 });
}

await check('premium upgrade keeps three chosen suits and permits choices four and five after rerender',async()=>{
 const f=fixture({limit:3,count:3}),fourth={id:'four',template:'/s4'};assert.equal(f.render().catalogDisabled(fourth),true);
 // React receives the authoritative response after downloadUnlockSignal refresh.
 f.env.suitPolicy={...f.env.suitPolicy,limit:5};let view=f.render();assert.equal(view.limit,5);assert.equal(view.catalogDisabled(fourth),false);
 // The API double returns the current upgraded policy, just as the real route does.
 f.env.onSelectSuit=async(jobId,templates)=>{f.api.push({jobId,templates});return{limited:true,limit:5,choices:[...new Set([...f.env.suitPolicy.choices,...templates])]}};
 await view.selectAsset('suit',fourth);assert.equal(f.env.suitPolicy.choices.length,4);
 view=f.render();await view.selectAsset('suit',{id:'five',template:'/s5'});assert.equal(f.env.suitPolicy.choices.length,5);assert.deepEqual(f.env.suitPolicy.choices,['/s1','/s2','/s3','/s4','/s5']);assert.equal(f.render().catalogDisabled({template:'/s6'}),true);
});

await check('server policy rejection rolls back rendered suit and does not add history or applied selection',async()=>{
 const f=fixture({limit:5,count:3,serverError:true});await f.render().selectAsset('suit',{id:'four',template:'/s4'});
 assert.equal(f.native.length,1);assert.equal(f.api.length,1);assert.equal(f.hydrations.length,2);assert.equal(f.hydrations[1].layers,f.original);assert.equal(f.env.state.current,f.original);assert.equal(f.env.suitPolicy.choices.length,3);assert.equal(f.env.undo.current.length,0);assert.equal(f.env.assetBusy,false);assert.deepEqual(f.messages,['server denied current suit']);assert(!f.selections.some(([,stage])=>stage==='apply'));
});

await check('native asset failure retains the original suit without requesting a policy change',async()=>{
 const f=fixture({limit:5,count:3,nativeError:true});await f.render().selectAsset('suit',{id:'four',template:'/s4'});
 assert.equal(f.env.state.current,f.original);assert.equal(f.native.length,1);assert.equal(f.api.length,0);assert.equal(f.hydrations.length,0);assert.equal(f.env.undo.current.length,0);assert.equal(f.env.assetBusy,false);assert(f.messages[0].includes('ไม่สำเร็จ'));
});

await check('legacy unlimited work is not restricted by either advertised cap',async()=>{
 const f=fixture({limit:3,count:7,limited:false}),option={id:'eight',template:'/s8'},view=f.render();assert.equal(view.catalogDisabled(option),false);await view.selectAsset('suit',option);assert.equal(f.native.length,1);assert.equal(f.api.length,1);assert.equal(f.env.state.current.find(l=>l.id==='suit').templatePath,'/s8');assert.equal(f.env.suitPolicy.limited,false);
});

await check('missing limit retains the safe basic cap instead of granting premium choices',async()=>{
 const f=fixture({limit:3,count:3});delete f.env.suitPolicy.limit;const view=f.render();assert.equal(view.limit,3);const option={id:'four',template:'/s4'};assert.equal(view.catalogDisabled(option),true);await view.selectAsset('suit',option);assert.equal(f.native.length,0);assert.equal(f.api.length,0);
});

console.log(`PASS: ${passed} actual Studio suit-limit scenarios; native/image and API helpers simulated locally.`);
