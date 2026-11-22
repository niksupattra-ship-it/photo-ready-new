"""Actual compose/render branches on untouched native PNGs. No provider or customer calls."""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('THAI_FRAME_BASE','http://127.0.0.1:5202')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [1440,390]:
  page=b.new_page(viewport={'width':width,'height':1000})
  page.goto(BASE+'/scripts/fixtures/thai-work-ai-offers.html',wait_until='domcontentloaded')
  result=page.evaluate('''async()=>{
   const source=(await import('/src/main.jsx?raw')).default;
   const {planThaiBodyFrame}=await import('/src/thai-body-framing.js');
   const {THAI_REAL_FACE_VERSION}=await import('/thai-real-face-policy.js');
   const canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
   const canvasPng=c=>new Promise(r=>c.toBlob(r,'image/png'));
   const decodedPortraitImage=blob=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),im=new Image();im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};im.onerror=reject;im.src=url});
   const native=canvasFor(900,1200),ctx=native.getContext('2d');
   ctx.fillStyle='#b48e77';ctx.beginPath();ctx.ellipse(450,350,135,175,0,0,Math.PI*2);ctx.fill();
   const garment=new Image();garment.src='/assets/government-uniforms/female-operational.png';await garment.decode();
   const gw=760,gh=gw*garment.height/garment.width;ctx.drawImage(garment,70,1180-gh,gw,gh);
   const blob=await canvasPng(native);blob.idpromPortraitComposition='en-outfit-body-v1';
   const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
   const before=await digest(blob);
   const env={planThaiBodyFrame,THAI_REAL_FACE_VERSION,ENGLISH_BODY_PORTRAIT_VERSION:'en-outfit-body-v1',ENGLISH_HEAD_PORTRAIT_VERSION:'en-head-portrait-v1',decodedPortraitImage,canvasFor,canvasPng};
   const start=source.indexOf('async function composePortrait('),end=source.indexOf(" const [bg,uniformImg]=",start);
   const compose=Function('env','with(env){'+source.slice(start,end)+'};return composePortrait}')(env);
   const renderStart=source.indexOf('async function renderAdjustedFinal('),body=source.indexOf(' if(headMasterBlob.idpromPortraitComposition===ENGLISH_BODY_PORTRAIT_VERSION)',renderStart),renderEnd=source.indexOf(' // V80 MASTER-RESOLUTION COMPOSITE:',body);
   const render=Function('env','with(env){return async(headMasterBlob,lock,adjust,backgroundPath=null,liveCanvas=null,studioLayers=null)=>{'+source.slice(body,renderEnd)+'}}')(env);
   const old=await compose(blob),legacy=await render(blob,old.lock,{scale:1,x:0,y:0});
   blob.idpromThaiRealFaceVersion=THAI_REAL_FACE_VERSION;
   const fit=await compose(blob),framed=await render(blob,fit.lock,{scale:1,x:0,y:0});
   const alpha=async b=>{const im=await decodedPortraitImage(b),c=canvasFor(im.width,im.height),x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(450,1199,1,1).data[3]};
   const nativePixels=ctx.getImageData(0,0,900,1200).data,plan=planThaiBodyFrame(nativePixels,900,1200);
   if(await alpha(legacy)!==0)throw Error('Fixture must reproduce the lower strip');
   if(await alpha(framed)<250)throw Error('Coat must reach the exported PNG bottom edge');
   if(await digest(blob)!==before)throw Error('Native face/output pixels changed');
   if(Math.abs((900*fit.lock.scale)/(1200*fit.lock.scale)-.75)>1e-12)throw Error('Non-uniform image stretch');
   if(plan.crown*plan.scale+plan.y<0)throw Error('Hair crown clipped');
   const frame=await decodedPortraitImage(framed);
   return {nativeUnchanged:true,uniformScale:true,oldBottomAlpha:0,newBottomAlpha:await alpha(framed),width:frame.width,height:frame.height,lock:fit.lock};
  }''')
  assert result['newBottomAlpha']==255;assert result['width']==900 and result['height']==1200
  print(json.dumps({'viewport':width,**result}))
  page.close()
 b.close()
