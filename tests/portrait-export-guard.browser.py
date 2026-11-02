"""Actual Canvas renderer: reject outfit-only exports before accepting pixels."""
from playwright.sync_api import sync_playwright
import os
base=os.environ.get('PORTRAIT_GUARD_BASE','http://127.0.0.1:5180')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 page.goto(base+'/scripts/fixtures/easy-mode.html',wait_until='networkidle')
 result=page.evaluate('''async()=>{
  const {assertPortraitExportReady}=await import('/src/portrait-export-guard.js');
  const {default:source}=await import('/src/studio-editor.jsx?raw');
  const {layerAxes}=await import('/src/studio-transform.js');
  const {warpStudioCollar}=await import('/src/studio-collar.js');
  const {composeCollarPins}=await import('/src/collar-pin-controls.js');
  const render=new Function('env','with(env){'+source.slice(source.indexOf('function paintLayers('),source.indexOf('const sceneCaches='))+';return paintLayers}')({W:900,H:1200,layerAxes,warpStudioCollar,composeCollarPins});
  const surface=(colour,rect)=>{const c=document.createElement('canvas');c.width=900;c.height=1200;const x=c.getContext('2d');x.fillStyle=colour;if(rect)x.fillRect(...rect);return c};
  const fixture=()=>{
   const images={bg:surface('#8bc9ef',[0,0,900,1200]),head:surface('#d4a48e',[300,140,300,340]),suit:surface('#fff',[100,520,700,680])};
   const layers=Object.keys(images).map(id=>({id,kind:id==='bg'?'background':id,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,sourceFrame:{x:0,y:0,w:900,h:1200}}));
   const assets=new Map(Object.entries(images).map(([id,c])=>[id,{original:c,buffer:c,dirty:false,collarKey:'0,0',collarSource:c}]));
   return {layers,assets};
  };
  const cases=[];
  const check=(name,change,expected)=>{const f=fixture();change(f);let accepted=false;try{accepted=assertPortraitExportReady(f.layers,f.assets,render)}catch(e){if(e.auditCode!=='portrait_incomplete')throw e}if(accepted!==expected)throw Error(name+': '+accepted);cases.push(name)};
  check('valid complete portrait',()=>{},true);
  check('hidden head leaves only outfit',f=>f.layers[1].visible=false,false);
  check('zero opacity head',f=>f.layers[1].opacity=0,false);
  check('head asset not hydrated',f=>f.assets.delete('head'),false);
  check('transparent head buffer',f=>f.assets.get('head').buffer=surface('#000'),false);
  check('head moved outside export',f=>f.layers[1].x=2000,false);
  check('fully erased head',f=>{const a=f.assets.get('head');a.mask=surface('#000');a.dirty=true},false);
  check('head covered by an opaque later layer',f=>{const c=surface('#fff',[0,0,900,1200]);const a=f.assets.get('suit');a.buffer=c;a.original=c;a.collarSource=c},false);
  check('transparent background with visible head is valid',f=>f.layers[0].visible=false,true);
  check('a second hidden duplicate does not invalidate a visible head',f=>f.layers.push({...f.layers[1],id:'hidden-copy',visible:false}),true);
  // Exercise the real export handler, including its catch/audit path.
  for(const automatic of [false,true]){
   const f=fixture();f.assets.delete('head');const events=[];
   const env={ready:true,processActive:false,assetBusy:false,hydratingRef:{current:false},suitRequestRef:{current:false},exportingRef:{current:false},saveSequenceRef:{current:0},
    setStatus:value=>events.push(['status',value]),setSavePopup:value=>events.push(['popup',value]),prepareSourceDownload:async()=>{},onCheckoutPreview:null,
    state:{current:f.layers},assets:{current:f.assets},outputHeads:layers=>layers.filter(l=>l.kind==='head').map(l=>({...l,jobId:'fixture-job'})),
    beginDownloadAudit:()=>({emit:(event,details)=>events.push([event,details])}),easyMode:false,flushTransforms:()=>{},assertPortraitExportReady,paintLayers:render,
    allowOutput:async()=>{events.push(['credit']);return true},nativeCanvas:()=>{events.push(['file']);throw Error('invalid image reached file generation')}};
   const start=source.indexOf(' const exportImage=async'),end=source.indexOf(' const autoDownloadAttempted=',start);
   const handler=new Function('env','with(env){'+source.slice(start,end)+';return exportImage}')(env);
   await handler('image/png',{automatic});
   if(events.some(e=>['credit','file','file_prepared'].includes(e[0])))throw Error('invalid portrait consumed credit or prepared a file');
   if(!events.some(e=>e[0]==='download_failed'&&e[1].errorCode==='portrait_incomplete'))throw Error('missing specific failure audit');
   if(env.exportingRef.current)throw Error('export lock not released');
   cases.push(automatic?'automatic incomplete export blocked':'manual incomplete export blocked before credit');
  }
  return {passed:cases.length,cases};
 }''')
 print('PASS real export renderer and image-content guard:',result)
 browser.close()
