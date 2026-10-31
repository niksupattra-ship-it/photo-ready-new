import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {STUDIO_ACCESSORY_PLACEMENT} from '../src/studio-accessory-placement.js';
import {syncHairAttachments,headPose} from '../src/hair-preview-fit.js';
import {STUDIO_SUIT_FIT_VERSION} from '../src/studio-suit-fit.js';

// Exercise the production selection handler. Native image decoding, the face
// measurement boundary and server policy use deterministic local doubles.
// Geometry/pixel quality is covered separately by the fitting-module checks.
const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const begin=editor.indexOf(' const selectAsset=async(kind,option)=>{');
const end=editor.indexOf('\n const openBackgroundColor=',begin);
assert(begin>=0&&end>begin,'actual suit selection handler is missing');
const cap=editor.match(/ const suitChoiceLimit=[^;]+;/)?.[0];
assert(cap,'actual suit cap reader is missing');
const makeHandler=new Function('env',`with(env){${cap}${editor.slice(begin,end)};return selectAsset}`);
const noop=()=>{};
const option={id:'new-suit',template:'/assets/job-uniforms/female-white-shirt.png',name:'ชุดใหม่'};

function fixture({processed=true,callback=true,fitError=false,fitCode=null,fitMessage='face measurement failed',nativeError=false,apiError=false,hydrateError=false,warped=true}={}){
 const source={tag:'immutable native head and makeup pixels'};
 const mask={tag:'edited head alpha'},warp={tag:'current warped head pixels'},original={tag:'current head asset pixels'};
 const head={id:'head',kind:'head',name:'หัว · คอ · ผม',jobId:'paid-output-current',source,processedOriginalSource:source,mask,
  sourceFrame:{x:220,y:70,w:460,h:750},x:18,y:-11,scale:1.08,squeezeX:1,squeezeY:1,rotation:2,opacity:1,visible:true,locked:false,
  femaleEyeStyle:'makeup',initialFemaleEyeStyle:'makeup',femaleFinishReference:'stored-finish-reference',hairId:'female_7',restrictedTrial:false,outputUnlocked:true};
 const suitFrame={x:-21,y:356,w:942,h:1220};
 const suit={id:'suit',kind:'suit',name:'ชุด',templatePath:'/assets/government-uniforms/female-operational.png',source:{tag:'old suit pixels'},
  sourceFrame:suitFrame,collarFrame:suitFrame,neckWidth:-27,neckHeight:9,x:6,y:8,scale:1.03,squeezeX:1,squeezeY:1,rotation:1,opacity:1,visible:true,locked:false};
 const background={id:'background',kind:'background',name:'พื้นหลัง',source:{tag:'unchanged background'}};
 const hair={id:'hair',kind:'hair-preview',hairHeadId:head.id,hairHeadPose:headPose(head),hairRole:'front',source:{tag:'current free hair pixels'},
  sourceFrame:head.sourceFrame,x:head.x+7,y:head.y-4,scale:head.scale*1.02,squeezeX:1,squeezeY:1,rotation:head.rotation+1,opacity:1,visible:true,locked:false};
 const accessory={id:'ribbon',kind:'ribbon',name:'แพรแถบ',source:{tag:'insignia pixels'},sourceFrame:{x:565,y:635,w:72,h:29},x:6,y:8,scale:1.03,rotation:1,visible:true,locked:false};
 const raw={id:'raw',kind:'source-photo',name:'รูปที่เพิ่ม',source:{tag:'unprocessed photo'}};
 const originalLayers=processed?[background,head,hair,suit,accessory]:[background,raw,suit,accessory];
 const fit=[],native=[],api=[],hydrations=[],messages=[],selection=[],selected=[];
 const measured=async()=>[{x:.5,y:.5}];
 const env={ready:true,assetBusy:false,processActive:false,comparing:false,touch:false,easyMode:false,suitRequestRef:{current:null},beginSuitPreview:()=>null,endSuitPreview:noop,setSuitSelecting:noop,
  suitPolicy:{limited:true,limit:5,choices:[suit.templatePath]},canUseAllSuits:true,freeTemplatePaths:[],
  layerKind:l=>l.kind,ASSET_NAMES:{suit:'ชุด',background:'พื้นหลัง',collar:'เข็มปกคอ',chest:'เข็มติดอก',ribbon:'แพรแถบ'},
  STUDIO_ACCESSORY_PLACEMENT,STUDIO_SUIT_FIT_VERSION,W:900,H:1200,state:{current:originalLayers},assets:{current:new Map([[head.id,{original,warped:warped?warp:null,mask}]])},
  placementRef:{current:{W:2256,H:3072,uX:0,uY:1800,uW:2256,uH:2100,templatePath:suit.templatePath}},
  onMeasureSuitFace:callback?measured:undefined,outputHeads:layers=>layers.filter(l=>l.kind==='head'),
  trackUniformSelection:(...args)=>selection.push(args),onRequestUnlock:noop,
  setAssetBusy:value=>{env.assetBusy=value},setStatus:value=>messages.push(value),setSelected:value=>selected.push(value),setRevision:noop,
  setSuitPolicy:value=>{env.suitPolicy=value},flushTransforms:noop,historySnapshot:()=>env.state.current,
  fresh:layer=>({id:'created-'+layer.name,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,...layer}),
  nativeAsset:async(kind,value,frame,preset)=>{native.push({kind,option:value,frame,preset});if(nativeError)throw Error('native image decode failed');return{source:{tag:'new native pixels'},sourceFrame:frame,collarParts:null}},
  fitStudioSuit:async args=>{
   fit.push(args);if(fitError)throw Object.assign(Error(fitMessage),fitCode?{code:fitCode}:{});
   return args.layers.filter(l=>!(l.kind==='neck-fit'&&l.hairHeadId===head.id)).map(l=>l.id===head.id?{...l,x:-14,y:26,scale:.96,rotation:1}:l.id===suit.id?{...l,neckWidth:-33,neckHeight:0}:l);
  },
  hydrate:async(layers,unchangedIds)=>{hydrations.push({layers,unchangedIds});if(hydrateError)return false;env.state.current=syncHairAttachments(layers);return true},
  onSelectSuit:async(jobId,templates)=>{api.push({jobId,templates});if(apiError)throw Error('server denied suit choice');return{...env.suitPolicy,choices:[...new Set([...env.suitPolicy.choices,...templates])]}},
  undo:{current:[]},redo:{current:['existing redo']},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false}
 };
 return {env,head,hair,suit,accessory,background,raw,originalLayers,source,mask,warp,original,measured,fit,native,api,hydrations,messages,selection,selected,run:(kind='suit',value=option)=>makeHandler(env)(kind,value)};
}

let passed=0;
const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};

await check('processed suit selection fits the current edited head and commits geometry without changing identity or finish',async()=>{
 const f=fixture();await f.run();assert.equal(f.fit.length,1);const args=f.fit[0];
 assert.equal(args.previousSuit,f.suit);assert.equal(args.headSource,f.warp);assert.equal(args.headMask,f.mask);assert.equal(args.measureFace,f.measured);
 assert.equal(args.nextSuit.templatePath,option.template);assert.equal(args.layers.find(l=>l.id==='head'),f.head);
 const result=f.env.state.current.find(l=>l.id==='head');assert.notEqual(result.x,f.head.x);assert.equal(result.scale,.96);
 for(const key of ['id','source','processedOriginalSource','mask','sourceFrame','jobId','femaleEyeStyle','initialFemaleEyeStyle','femaleFinishReference','hairId','restrictedTrial','outputUnlocked'])assert.equal(result[key],f.head[key],key+' must survive fitting');
 const fittedSuit=f.env.state.current.find(l=>l.id==='suit');assert.equal(fittedSuit.neckWidth,-33);
 for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','sourceFrame','collarFrame','opacity'])assert.equal(fittedSuit[key],f.suit[key],'garment '+key+' must stay fixed');
 assert.equal(f.env.state.current.find(l=>l.id==='ribbon'),f.accessory);assert(!f.env.state.current.some(l=>l.kind==='neck-fit'));
 assert.deepEqual(f.api,[{jobId:f.head.jobId,templates:[f.suit.templatePath,option.template]}]);assert.equal(f.env.undo.current[0],f.originalLayers);assert.deepEqual(f.env.redo.current,[]);assert.equal(f.env.assetBusy,false);
});

await check('the body frame and collar reference remain independently fixed on a moved, rotated and squeezed suit',async()=>{
 const f=fixture();f.suit.sourceFrame={x:-47,y:287,w:991,h:1286};f.suit.collarFrame={x:-11,y:332,w:905,h:1170};
 Object.assign(f.suit,{x:41,y:-28,scale:1.19,squeezeX:.94,squeezeY:1.06,rotation:-4});
 const before=Object.fromEntries(['sourceFrame','collarFrame','x','y','scale','squeezeX','squeezeY','rotation'].map(k=>[k,f.suit[k]]));
 await f.run();assert.equal(f.native[0].frame,f.suit.sourceFrame,'native PNG must use the body frame, not the collar reference or stale placement');
 for(const key of Object.keys(before)){assert.equal(f.fit[0].nextSuit[key],before[key],'fit input '+key);assert.equal(f.env.state.current.find(l=>l.id==='suit')[key],before[key],'committed '+key)}
 assert.equal(f.env.state.current.find(l=>l.id==='ribbon'),f.accessory);assert.equal(f.env.state.current.find(l=>l.id==='head').source,f.source);
});

await check('an old generated neck fill is removed instead of being recreated or stretched',async()=>{
 const f=fixture();f.originalLayers.splice(2,0,{id:'old-neck',kind:'neck-fit',hairHeadId:f.head.id,source:{tag:'old artificial neck'},locked:false});
 await f.run();assert.equal(f.fit.length,1);assert(!f.env.state.current.some(l=>l.kind==='neck-fit'));assert.equal(f.env.state.current.find(l=>l.id==='head').source,f.source);assert.equal(f.env.undo.current[0],f.originalLayers);
});

await check('unwarped head analysis uses its current original asset and existing edited mask',async()=>{
 const f=fixture({warped:false});await f.run();assert.equal(f.fit[0].headSource,f.original);assert.equal(f.fit[0].headMask,f.mask);
});

await check('linked free hair follows the fitted head while preserving its source and relative adjustment',async()=>{
 const f=fixture();await f.run();const result=f.env.state.current.find(l=>l.id==='hair');
 const nextHead=f.env.state.current.find(l=>l.id==='head');
 const distance=(layer,anchor)=>Math.hypot(layer.x-anchor.x,layer.y-anchor.y)/anchor.scale;
 const angle=(layer,anchor)=>Math.atan2(layer.y-anchor.y,layer.x-anchor.x)-anchor.rotation*Math.PI/180;
 assert.equal(result.source,f.hair.source);assert.notEqual(result.x,f.hair.x);
 assert(Math.abs(distance(result,nextHead)-distance(f.hair,f.head))<1e-9,'relative offset follows head scale');
 assert(Math.abs(angle(result,nextHead)-angle(f.hair,f.head))<1e-9,'relative offset follows head rotation');
 assert(Math.abs(result.scale/nextHead.scale-f.hair.scale/f.head.scale)<1e-9,'independent hair size remains relative to the head');
 assert.equal(result.rotation-nextHead.rotation,f.hair.rotation-f.head.rotation);assert.deepEqual(result.hairHeadPose,headPose(nextHead));
});

await check('fixed accessory and head pixel assets are reused while the changed garment image reloads',async()=>{
 const f=fixture();await f.run();const ids=f.hydrations[0].unchangedIds;
 assert(ids.has('head'));assert(ids.has('hair'));assert(ids.has('background'));assert(!ids.has('suit'));assert(ids.has('ribbon'));
 assert.equal(f.env.state.current.find(l=>l.id==='ribbon').source,f.accessory.source);assert.equal(f.env.state.current.find(l=>l.id==='ribbon'),f.accessory);
});

// Hydration still must honor an explicitly replaced pixel surface from an injected
// replacement dependency. The production fitter's separate contract forbids
// changing these head fields during ordinary garment fitting.
for(const changed of ['mask','warpSource','source'])await check('an injected replacement '+changed+' surface cannot reuse a stale pixel cache when its frame is identical',async()=>{
 const f=fixture(),fit=f.env.fitStudioSuit,replacement={tag:'newly fitted '+changed+' pixels'},oldValue=f.head[changed];
 f.env.fitStudioSuit=async args=>(await fit(args)).map(l=>l.id===f.head.id?{...l,[changed]:replacement}:l);
 await f.run();assert.equal(f.fit.length,1);assert.equal(f.hydrations.length,1);assert(!f.hydrations[0].unchangedIds.has(f.head.id),'old asset must not bypass new pixel hydration');assert(f.hydrations[0].unchangedIds.has(f.background.id));
 const result=f.env.state.current.find(l=>l.id===f.head.id);assert.equal(result[changed],replacement);assert.equal(result.sourceFrame,f.head.sourceFrame);assert.equal(result.jobId,f.head.jobId);assert.equal(result.femaleEyeStyle,f.head.femaleEyeStyle);assert.equal(result.initialFemaleEyeStyle,f.head.initialFemaleEyeStyle);assert.equal(f.head[changed],oldValue,'original history pixels remain untouched');
 if(changed!=='source')assert.equal(result.source,f.head.source);if(changed!=='mask')assert.equal(result.mask,f.head.mask);
});

await check('choosing a suit before processing keeps the existing preparation flow and never measures or fits a face',async()=>{
 const f=fixture({processed:false});await f.run();assert.equal(f.fit.length,0);assert.equal(f.api.length,0);assert.equal(f.hydrations.length,1);assert.equal(f.env.state.current.find(l=>l.id==='raw'),f.raw);assert.equal(f.env.state.current.find(l=>l.id==='suit').templatePath,option.template);
});

await check('a preceding head without a processed job never supplies the portrait asset, lock or policy identity',async()=>{
 const f=fixture(),loose={...f.head,id:'unprocessed-head',jobId:undefined,source:{tag:'unprocessed loose head pixels'},locked:true};
 f.originalLayers.splice(1,0,loose);f.env.assets.current.set(loose.id,{original:{tag:'wrong portrait asset'},mask:{tag:'wrong alpha'}});
 await f.run();assert.equal(f.fit.length,1);assert.equal(f.fit[0].headSource,f.warp);assert.equal(f.fit[0].headMask,f.mask);
 assert.equal(f.env.state.current.find(l=>l.id===loose.id),loose);assert.equal(f.env.state.current.find(l=>l.id===f.head.id).x,-14);
 assert.deepEqual(f.api,[{jobId:f.head.jobId,templates:[f.suit.templatePath,option.template]}]);assert.equal(f.env.undo.current[0],f.originalLayers);
});

await check('head-only artwork without a processed job neither triggers fitting nor sends an undefined policy request',async()=>{
 const f=fixture();delete f.head.jobId;await f.run();assert.equal(f.fit.length,0);assert.equal(f.api.length,0);
 assert.equal(f.env.state.current.find(l=>l.id===f.head.id),f.head);assert.equal(f.env.state.current.find(l=>l.id==='suit').templatePath,option.template);assert.equal(f.env.undo.current[0],f.originalLayers);
});

await check('an editor without the optional local-measurement callback retains its legacy suit selection behavior',async()=>{
 const f=fixture({callback:false});await f.run();assert.equal(f.fit.length,0);assert.equal(f.env.state.current.find(l=>l.id==='head'),f.head);assert.equal(f.api.length,1);
});

await check('returning to the already selected suit preserves manual collar and head geometry with no loading or new policy request',async()=>{
 const f=fixture();await f.run('suit',{id:'same',template:f.suit.templatePath});assert.equal(f.env.state.current,f.originalLayers);assert.equal(f.env.state.current.find(l=>l.id==='suit').neckWidth,-27);assert.equal(f.native.length,0);assert.equal(f.fit.length,0);assert.equal(f.api.length,0);assert.equal(f.hydrations.length,0);assert.equal(f.env.undo.current.length,0);assert.equal(f.env.assetBusy,false);assert.deepEqual(f.selected,['suit']);
});

await check('clicking the current outfit repairs an old generated neck instead of keeping the rejected extension',async()=>{
 const f=fixture();f.suit.autoSuitFitVersion='suit-switch-fit-v1';f.originalLayers.splice(2,0,{id:'old-neck',kind:'neck-fit',hairHeadId:f.head.id,source:{tag:'old copied neck'},locked:false});
 await f.run('suit',{id:'same',template:f.suit.templatePath});assert.equal(f.fit.length,1,'legacy generated neck must not bypass the corrected fitting');assert.equal(f.hydrations.length,1);assert(!f.env.state.current.some(l=>l.kind==='neck-fit'));
 for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','sourceFrame','collarFrame'])assert.equal(f.env.state.current.find(l=>l.id==='suit')[key],f.suit[key],'repair must keep garment '+key);
});

for(const locked of ['head','hair'])await check('a locked '+locked+' keeps the entire existing composition unchanged before native work',async()=>{
 const f=fixture();f[locked].locked=true;await f.run();assert.equal(f.env.state.current,f.originalLayers);assert.equal(f.native.length,0);assert.equal(f.fit.length,0);assert.equal(f.api.length,0);assert.equal(f.env.undo.current.length,0);assert(f.messages[0].includes('ปลดล็อก'));
});

await check('the existing purchased suit cap rejects a new suit before any fit or image work',async()=>{
 const f=fixture();f.env.suitPolicy={limited:true,limit:3,choices:[f.suit.templatePath,'/used2','/used3']};await f.run();assert.equal(f.env.state.current,f.originalLayers);assert.equal(f.fit.length,0);assert.equal(f.native.length,0);assert.equal(f.api.length,0);assert.equal(f.hydrations.length,0);assert(f.messages[0].includes('ครบ 3 ชุด'));
});

for(const failure of ['nativeError','hydrateError'])await check(failure+' preserves the old work, undo and policy without a false completed selection',async()=>{
 const f=fixture({[failure]:true});await f.run();assert.equal(f.env.state.current,f.originalLayers);assert.equal(f.api.length,0);assert.equal(f.env.undo.current.length,0);assert.deepEqual(f.env.redo.current,['existing redo']);assert.equal(f.env.assetBusy,false);assert(!f.selection.some(([,stage])=>stage==='apply'));if(failure==='hydrateError')assert(f.messages.at(-1).includes('งานเดิมยังอยู่'));
});

for(const missing of ['fitError','missingAsset'])await check(missing+' shows the selected garment with a warning and keeps the original portrait intact',async()=>{
 const f=fixture({fitError:missing==='fitError',fitCode:'SUIT_FIT_SOURCE_SHORT'});if(missing==='missingAsset')f.env.assets.current.clear();
 await f.run();assert.equal(f.native.length,1);assert.equal(f.api.length,1);assert.equal(f.hydrations.length,1);
 const head=f.env.state.current.find(l=>l.id===f.head.id),suit=f.env.state.current.find(l=>l.id===f.suit.id);
 assert.equal(head,f.head);assert.equal(head.source,f.source);assert.equal(suit.templatePath,option.template);assert.equal(suit.autoCollarFitApplied,false);assert(suit.autoSuitFitWarning);
 for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','sourceFrame','collarFrame'])assert.equal(suit[key],f.suit[key]);
 assert.equal(f.env.state.current.find(l=>l.id==='ribbon'),f.accessory);assert.equal(f.env.undo.current[0],f.originalLayers);assert.deepEqual(f.env.redo.current,[]);assert(f.messages.at(-1).includes('เลือก ชุดใหม่ แล้ว'));assert(f.messages.at(-1).includes('ยังจัดหัว'));
});

await check('server policy rejection restores head, free hair, collar and accessories and retains undo/redo',async()=>{
 const f=fixture({apiError:true});await f.run();assert.equal(f.fit.length,1);assert.equal(f.hydrations.length,2);assert.equal(f.hydrations[1].layers,f.originalLayers);assert.deepEqual(f.env.state.current,f.originalLayers);assert.equal(f.env.undo.current.length,0);assert.deepEqual(f.env.redo.current,['existing redo']);assert.equal(f.env.assetBusy,false);assert.equal(f.messages.at(-1),'server denied suit choice');assert(!f.selection.some(([,stage])=>stage==='apply'));
});

for(const useCollarFrame of [true,false])await check('new insignia use the current fitted '+(useCollarFrame?'collar frame':'source frame')+' rather than stale initial placement',async()=>{
 const f=fixture();if(!useCollarFrame)delete f.suit.collarFrame;
 await f.run('chest',{id:'new-pin',src:'/assets/pin.png',name:'เข็มใหม่'});assert.equal(f.fit.length,0);assert.equal(f.api.length,0);assert.equal(f.native.length,1);assert.equal(f.native[0].frame,useCollarFrame?f.suit.collarFrame:f.suit.sourceFrame);
 const created=f.env.state.current.find(l=>l.kind==='chest');assert.equal(created.x,f.suit.x);assert.equal(created.y,f.suit.y);assert.equal(created.scale,f.suit.scale);assert.equal(created.rotation,f.suit.rotation);
 assert.equal(f.env.state.current.find(l=>l.id==='head'),f.head);
});

await check('removing the suit stays an explicit local removal and does not refit the head or consume another suit',async()=>{
 const f=fixture();await f.run('suit',null);assert.equal(f.fit.length,0);assert.equal(f.api.length,0);assert(!f.env.state.current.some(l=>l.kind==='suit'));assert.equal(f.env.state.current.find(l=>l.id==='head'),f.head);assert.equal(f.env.undo.current[0],f.originalLayers);
});

console.log(JSON.stringify({passed,scope:'Actual selectAsset handler with current hair attachment transform; native measurement, pixel fitting and server policy mocked. No account, payment or AI operations.'}));
