"""Compare production placement/export pixels with the pre-optimization composer.
Real browser canvases and local outfit PNGs; synthetic person and fixed landmarks.
Every external request is blocked. No AI, wallet or customer endpoint is called.
"""
import json,pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
main=(root/'src/main.jsx').read_text()
before=(root/'scripts/fixtures/compose-portrait-before.js').read_text()
start=main.index('async function composePortrait(')
current=main[start:main.index('\nconst MALE_INITIAL_NECK_SPACING_VERSION',start)]
start=main.index('async function renderAdjustedFinal(')
head_only=main[start:main.index(" const [bg,uniform]=",start)]+"throw Error('Unexpected full render');}"
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page();page.route('**/*',lambda r:r.continue_()if r.request.url.startswith('http://127.0.0.1:5193/')else r.abort())
 page.goto('http://127.0.0.1:5193/scripts/fixtures/compose-portrait-before.js')
 results=page.evaluate('''async ({before,current,headOnly})=>{
 const loadImage=src=>new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>bad(Error("Image failed: "+src));im.src=src.startsWith("/assets/")?"/public"+src:src});
 const decodedPortraitImage=async blob=>{const url=URL.createObjectURL(blob);try{return await loadImage(url)}finally{URL.revokeObjectURL(url)}};
 const canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const alphaBounds=async im=>{const c=canvasFor(im.naturalWidth,im.naturalHeight),x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,r=-1,t=c.height,b=-1;for(let y=0;y<c.height;y++)for(let q=0;q<c.width;q++)if(d[(y*c.width+q)*4+3]>8){l=Math.min(l,q);r=Math.max(r,q);t=Math.min(t,y);b=Math.max(b,y)}return {l,r,t,b,w:r-l+1,h:b-t+1}};
 const face=[];for(const [id,x,y]of [[234,.3,.37],[454,.7,.37],[152,.5,.62],[10,.5,.16],[33,.38,.32],[263,.62,.32]])face[id]={x,y};
 const getLandmarker=async()=>({detect:()=>({faceLandmarks:[face]})});
 const env={loadImage,decodedPortraitImage,alphaBounds,getLandmarker,canvasFor};
 const extract=(source,name)=>Function('env',`with(env){${source};return ${name}}`)(env);
 const old=extract(before,'composePortrait'),now=extract(current,'composePortrait'),render=extract(headOnly,'renderAdjustedFinal');
 let encodes=0;const encode=HTMLCanvasElement.prototype.toBlob;
 HTMLCanvasElement.prototype.toBlob=function(...args){encodes++;return encode.apply(this,args)};
 const check=(ok,message)=>{if(!ok)throw Error(message)};
 const output=[];
 for(const template of ['/assets/uniform.png','/assets/government-uniforms/female-operational.png'])for(const [w,h]of [[480,640],[800,1100]]){
  const c=canvasFor(w,h),x=c.getContext('2d');x.fillStyle='#d5a289';x.beginPath();x.ellipse(w*.5,h*.36,w*.22,h*.28,0,0,Math.PI*2);x.fill();x.fillRect(w*.37,h*.52,w*.26,h*.24);const blob=await new Promise(r=>c.toBlob(r));
  const prev=await old(blob,{scale:1,x:0,y:0},template),full=await now(blob,{scale:1,x:0,y:0},template);
  check(JSON.stringify(prev.lock)===JSON.stringify(full.lock),'Default placement changed');
  const expected=new Uint8Array(await prev.blob.arrayBuffer()),actual=new Uint8Array(await full.blob.arrayBuffer());
  check(expected.length===actual.length&&expected.every((v,i)=>v===actual[i]),'Default PNG changed');
  const n=encodes,fast=await now(blob,{scale:1,x:0,y:0},template,{placementOnly:true});
  check(encodes===n&&fast.blob===null,'Placement-only path encoded a PNG');
  check(JSON.stringify(prev.lock)===JSON.stringify(fast.lock),'Optimized placement changed');
  const a=[],b=[];a.headOnly=b.headOnly=true;
  await render(blob,prev.lock,{scale:1,x:0,y:0,rotation:0},0,{width:0,length:0},undefined,null,{},null,{},false,null,0,null,{},a);
  await render(blob,fast.lock,{scale:1,x:0,y:0,rotation:0},0,{width:0,length:0},undefined,null,{},null,{},false,null,0,null,{},b);
  check(JSON.stringify(a)===JSON.stringify(b),'Native head pixels/sourceFrame changed');
  output.push({template,width:w,height:h,defaultPngIdentical:true,placementIdentical:true,nativeHeadLayerIdentical:true,unusedPngEncodes:0});
 }
 return output;
}''',{'before':before,'current':current,'headOnly':head_only})
 browser.close()
print(json.dumps(results,indent=2))
