// Actual transparent-edge deformation and native-pixel/rollback invariants.
// Uses local Chromium canvases only; no accounts, AI, payments or external APIs.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planWarpSpace} from '../src/studio-warp-space.js';
const rows=[];
const pass=(name,run)=>{run();rows.push({name,passed:true});console.log('PASS '+name)};
pass('interior brush preserves the existing native surface and frame',()=>{
 assert.deepEqual(planWarpSpace({x:100,y:100,w:400,h:500},800,1000,{start:{x:250,y:300},end:{x:270,y:320},radius:30}),{expanded:false});
});
pass('native integer padding preserves exact density and coordinates on both axes',()=>{
 const frame={x:137.25,y:241.75,w:213.5,h:300.25},p=planWarpSpace(frame,427,901,{start:{x:140,y:244},end:{x:120,y:220},radius:40});assert(p.expanded);
 const sx=427/frame.w,sy=901/frame.h;assert.equal(p.width/p.frame.w,sx);assert.equal(p.height/p.frame.h,sy);assert(Math.abs(p.frame.x+p.padding.left/sx-frame.x)<1e-9);assert(Math.abs(p.frame.y+p.padding.top/sy-frame.y)<1e-9);assert.equal(p.width,427+p.padding.left+p.padding.right);
});
pass('invalid and unbounded drags fail before allocation; detached brushes do not grow blank space',()=>{
 const f={x:0,y:0,w:900,h:1200};assert(planWarpSpace(f,2256,3072,{start:{x:100,y:100},end:{x:1e8,y:1e8},radius:200}).limited);assert(planWarpSpace(f,0,3072,{start:{x:1,y:1},radius:20}).limited);assert(planWarpSpace(f,2256,3072,{start:{x:NaN,y:1},radius:20}).limited);assert.deepEqual(planWarpSpace(f,2256,3072,{start:{x:1e6,y:1e6},radius:20}),{expanded:false});
});
pass('an image at the storage limit cannot become an unsaveable oversized image',()=>{
 const p=planWarpSpace({x:0,y:0,w:2000,h:4000},2000,4000,{start:{x:1000,y:3999},end:{x:1000,y:4050},radius:20});assert.equal(p.expanded,false);assert.equal(p.error.code,'WARP_SPACE_LIMIT');
});
let server,browser;
try{
 server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,strictPort:true}});await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
 const{chromium}=await import(process.env.IDPROM_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');browser=await chromium.launch({executablePath:process.env.IDPROM_TEST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();
 await page.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());await page.route(base+'/warp-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Local warp surface test</title>'}));await page.goto(base+'/warp-test');
 const browserRows=await page.evaluate(async()=>{
  const{ensureWarpSpace}=await import('/src/studio-warp-space.js'),{liquifyCanvas}=await import('/src/studio-liquify.js');
  const rows=[],check=(name,run)=>{run();rows.push({name,passed:true})},assert=(ok,message)=>{if(!ok)throw Error(message||'assertion failed')};
  const make=(w,h,color=null)=>{const c=document.createElement('canvas');c.width=w;c.height=h;if(color){const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h)}return c};
  const pixel=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
  const bytes=c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data];
  const fixture=()=>{const original=make(120,160),x=original.getContext('2d');x.fillStyle='#eac0a8';x.fillRect(20,0,80,160);x.fillStyle='#ff0000';x.fillRect(40,35,1,1);return {layer:{id:'head',kind:'head',sourceFrame:{x:300,y:200,w:120,h:160},source:original,x:12,y:-9,scale:1.2,rotation:17,squeezeX:.8,squeezeY:1.1,jobId:'local-job'},asset:{original,mask:make(120,160,'#fff'),warped:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,buffer:make(120,160),dirty:false}}};
  check('expansion translates original pixels and transparent padding without moving the layer',()=>{
   const{asset,layer}=fixture(),before=bytes(asset.original),next=ensureWarpSpace(asset,layer,{start:{x:305,y:205},end:{x:280,y:180},radius:35});assert(next.expanded);assert(JSON.stringify(bytes(asset.original))===JSON.stringify(before),'old source changed');
   const{left,top}=next.padding;assert(JSON.stringify(pixel(next.asset.original,left+40,top+35))===JSON.stringify([255,0,0,255]),'native landmark moved');assert(pixel(next.asset.original,0,0)[3]===0,'padding not transparent');
   for(const key of ['x','y','scale','rotation','squeezeX','squeezeY','jobId'])assert(next.layer[key]===layer[key],key+' changed');
   assert(asset.original.width===120&&asset.original.height===160);assert(next.layer.source===next.asset.original&&next.asset.sourceFrame===next.layer.sourceFrame);
   assert(Math.abs(next.frame.x+left*next.frame.w/next.width-layer.sourceFrame.x)<1e-9,'scene x changed');
  });
  check('a dragged neck edge can create visible skin below its former image boundary',()=>{
   const{asset,layer}=fixture();asset.warped=make(120,160);asset.warped.getContext('2d').drawImage(asset.original,0,0);asset.warpBaseMask=make(120,160,'#fff');
   const next=ensureWarpSpace(asset,layer,{start:{x:360,y:350},end:{x:360,y:400},radius:45});assert(next.expanded);let last={x:360,y:345};
   for(let y=346;y<=405;y++){const p={x:360,y};liquifyCanvas(next.asset.warped,next.asset.mask,p,45,{x:0,y:1},'push',1,next.frame);last=p}
   const x=Math.round((360-next.frame.x)*next.width/next.frame.w),oldBottom=Math.round((360-next.frame.y)*next.height/next.frame.h);
   let visible=0;for(let y=oldBottom;y<Math.min(next.height,oldBottom+45);y++)if(pixel(next.asset.warped,x,y)[3]>32&&pixel(next.asset.mask,x,y)[3]>32)visible++;
   assert(visible>=8,'skin remained clipped at old edge: '+visible);assert(asset.original.height===160,'baseline source modified');
  });
  check('all masks, restore surfaces, collar parts and frame-coupled references stay aligned',()=>{
   const{asset,layer}=fixture();asset.warped=asset.original;asset.warpBaseMask=make(60,80,'#fff');asset.eraseRestoreSource=asset.original;asset.warpRestoreBase=asset.original;asset.parts={left:asset.original,right:asset.original};asset.frameSources={processedOriginalSource:asset.original,hairOriginalSource:asset.original,makeupBaseSource:asset.original,makeupFullSource:asset.original};
   const next=ensureWarpSpace(asset,layer,{start:{x:305,y:350},end:{x:285,y:380},radius:35});assert(next.expanded);
   const all=[next.asset.original,next.asset.mask,next.asset.warped,next.asset.warpBaseMask,next.asset.eraseRestoreSource,next.asset.warpRestoreBase,...Object.values(next.asset.parts),...Object.values(next.asset.frameSources)];
   assert(all.every(c=>c.width===next.width&&c.height===next.height),'reference size mismatch');assert(next.asset.original===next.asset.warped&&next.asset.original===next.asset.eraseRestoreSource,'shared source needlessly copied');
   assert(next.layer.hairOriginalSource===next.asset.original&&next.layer.collarParts===next.asset.parts);assert(next.asset.warpBaseMask!==asset.warpBaseMask);assert(pixel(next.asset.warpBaseMask,next.padding.left+2,next.padding.top+2)[3]===255);assert(pixel(next.asset.warpBaseMask,0,next.height-1)[3]===0);
  });
  check('repeated growth preserves prior native pixels and does not stretch the frame',()=>{
   const{asset,layer}=fixture(),a=ensureWarpSpace(asset,layer,{start:{x:360,y:350},end:{x:360,y:375},radius:30}),b=ensureWarpSpace(a.asset,a.layer,{start:{x:360,y:a.frame.y+a.frame.h-10},end:{x:360,y:a.frame.y+a.frame.h+50},radius:30});assert(a.expanded&&b.expanded);assert(b.height>b.oldHeight);assert(b.width/b.frame.w===120/120);assert(b.height/b.frame.h===160/160);
   const x=Math.round((340-b.frame.x)*b.width/b.frame.w),y=Math.round((235-b.frame.y)*b.height/b.frame.h);assert(JSON.stringify(pixel(b.asset.original,x,y))===JSON.stringify([255,0,0,255]),'pixel drift after repeated expansion');
  });
  check('unexpected saved strings and memory limits reject atomically without allocating',()=>{
   const{asset,layer}=fixture(),before=bytes(asset.original);asset.warpBaseMask='data:image/png;base64,fixture';let allocations=0;
   const next=ensureWarpSpace(asset,layer,{start:{x:360,y:350},end:{x:360,y:400},radius:45},{createCanvas(){allocations++;throw Error('not expected')}});assert(next.error.code==='WARP_SPACE_INVALID'&&allocations===0);asset.warpBaseMask=null;
   const limited=ensureWarpSpace(asset,layer,{start:{x:360,y:350},end:{x:360,y:400},radius:45},{maxBytes:1,createCanvas(){allocations++;throw Error('not expected')}});assert(limited.error.code==='WARP_SPACE_LIMIT'&&allocations===0);assert(JSON.stringify(bytes(asset.original))===JSON.stringify(before));
  });
  check('an allocation failure releases only new surfaces and leaves live pixels untouched',()=>{
   const{asset,layer}=fixture(),before=bytes(asset.original),made=[];let count=0;
   const next=ensureWarpSpace(asset,layer,{start:{x:360,y:350},end:{x:360,y:400},radius:45},{createCanvas(w,h){if(++count===2)throw Error('injected allocation');const c=make(w,h);made.push(c);return c}});
   assert(next.error.code==='WARP_SPACE_ALLOCATION');assert(made.every(c=>c.width===1&&c.height===1),'new scratch not released');assert(asset.original.width===120&&asset.mask.height===160);assert(JSON.stringify(bytes(asset.original))===JSON.stringify(before),'live pixels changed');assert(!layer.warpSource);
  });
  return rows;
 });
 for(const row of browserRows){rows.push(row);console.log('PASS '+row.name)}
 const nativeResource=await page.evaluate(async()=>{
  const{ensureWarpSpace}=await import('/src/studio-warp-space.js'),{liquifyCanvas}=await import('/src/studio-liquify.js'),{createProjectResourceGuard,encodedImageSize}=await import('/src/project-resource-guard.js');
  const make=(w,h,color)=>{const c=Object.assign(document.createElement('canvas'),{width:w,height:h});if(color){const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h)}return c};
  const copy=source=>{const c=make(source.width,source.height);c.getContext('2d').drawImage(source,0,0);return c};
  const original=make(2256,3072),ctx=original.getContext('2d');ctx.fillStyle='#eac0a8';ctx.fillRect(500,0,1256,3072);ctx.fillStyle='#8d5e49';ctx.fillRect(600,1000,1000,4);
  const mask=make(2256,3072,'#fff'),warped=copy(original),baseMask=copy(mask),frame={x:200,y:0,w:500,h:800};
  const layer={id:'native-head',kind:'head',name:'หัว · คอ · ผม',source:original,sourceFrame:frame,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false,jobId:'inert-native-job',processedOriginalSource:original,hairOriginalSource:original,makeupBaseSource:original,makeupFullSource:original};
  const asset={original,mask,warped,warpBaseMask:baseMask,buffer:make(1,1),frameSources:Object.fromEntries(['processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource'].map(k=>[k,original]))};
  const background=make(1128,1536,'#3688ee'),suit=make(1504,1285,'#213047');
  const serialize=(head,a)=>{const encoded=new Map(),encode=c=>{if(!c)return null;if(!encoded.has(c))encoded.set(c,c.toDataURL('image/png'));return encoded.get(c)};const h={...head,source:encode(a.original),mask:encode(a.mask),warpSource:encode(a.warped),warpBaseMask:encode(a.warpBaseMask)};for(const k of ['processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource'])h[k]=encode(a.frameSources[k]);return {format:'idprom-studio',version:1,width:900,height:1200,layers:[{id:'background',name:'พื้นหลัง',kind:'background',source:encode(background),sourceFrame:{x:0,y:0,w:900,h:1200},x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false},{id:'suit',name:'ชุด',kind:'suit',source:encode(suit),sourceFrame:{x:0,y:600,w:900,h:600},x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,locked:false},h]}};
  const report=project=>{const fields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'],entries=new Set(),sizes=[];let encodedChars=0;for(const l of project.layers)for(const k of fields)if(l[k]){encodedChars+=l[k].length;entries.add(l[k])}for(const src of entries)sizes.push(encodedImageSize(src));try{return {ok:true,...createProjectResourceGuard(project).summary(),encodedChars,imageSizes:sizes}}catch(e){return {ok:false,error:e.message,code:e.code,encodedChars,uniquePixels:sizes.reduce((a,b)=>a+b.width*b.height,0),imageSizes:sizes}}};
  const before=report(serialize(layer,asset)),next=ensureWarpSpace(asset,layer,{start:{x:450,y:780},end:{x:450,y:810},radius:35});if(!next.expanded)return {before,expanded:false,error:next.error};
  const afterPadding=report(serialize(next.layer,next.asset));
  for(let y=785;y<=830;y+=5)liquifyCanvas(next.asset.warped,next.asset.mask,{x:450,y},35,{x:0,y:5},'push',1,next.frame);
  const after=report(serialize(next.layer,next.asset));
  return {scope:'Actual2256x3072nativehelperexpansionandoutwardliquify,actualPNGserializationwithsharedprocessed/hair/makeuprefs. Defaultbackground1128x1536andjob-suit1504x1285dimensionsmatchproductionassets. Syntheticflatpixelscompressmuchmorethanrealphotographs;encodedmemoryisafixturemeasurement,notall-photo-guarantee.',before,afterPadding,after,expanded:true,padding:next.padding,frame:next.frame,native:{width:next.width,height:next.height,pixels:next.width*next.height},aliasesPreserved:Object.values(next.asset.frameSources).every(c=>c===next.asset.original)};
 });
 if(process.env.IDPROM_WARP_RESOURCE_OUTPUT){await mkdir(dirname(process.env.IDPROM_WARP_RESOURCE_OUTPUT),{recursive:true});await writeFile(process.env.IDPROM_WARP_RESOURCE_OUTPUT,JSON.stringify(nativeResource,null,2)+'\n')}
 console.log('NATIVE_RESOURCE '+JSON.stringify(nativeResource));
 assert(nativeResource.expanded&&nativeResource.aliasesPreserved&&nativeResource.before.ok&&nativeResource.afterPadding.ok&&nativeResource.after.ok,'native representative project must remain within existing save/open resource limits');
 rows.push({name:'native2256x3072outwardwarpwithaliasedreferencesandproduction-sizedbackgroundandsuitremainsopenable',passed:true,resources:nativeResource});
}finally{if(browser)await browser.close();if(server)await server.close()}
const result={passed:rows.length,failed:0,scope:'Pure geometry planning and actual Chromium native canvas pixels/liquify, all local and inert.',results:rows};
if(process.env.IDPROM_WARP_SPACE_OUTPUT){await mkdir(dirname(process.env.IDPROM_WARP_SPACE_OUTPUT),{recursive:true});await writeFile(process.env.IDPROM_WARP_SPACE_OUTPUT,JSON.stringify(result,null,2)+'\n')}
console.log(JSON.stringify({passed:rows.length,failed:0}));
