from playwright.sync_api import sync_playwright
from pathlib import Path
import json
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page(viewport={'width':1140,'height':730});blocked=[]
 def route(r):
  if not r.request.url.startswith('http://127.0.0.1:5192/') or '/api/' in r.request.url:blocked.append(r.request.url);r.abort();return
  if r.request.url.endswith('/__native_skin_photo'):r.fulfill(content_type='text/html',body='<html><body style="margin:10px;background:#eee;font:16px sans-serif"></body></html>');return
  r.continue_()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/__native_skin_photo')
 result=p.evaluate('''async()=>{
 const {preparePreAiSkin}=await import('/src/pre-ai-skin.js');const {LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
 const im=new Image();im.src='/assets/face-finish/natural.webp';await im.decode();const W=im.naturalWidth,H=im.naturalHeight;
 // Explicit hand-labelled fixture, not a claim of automatic segmentation accuracy.
 const face=Array.from({length:478},()=>({x:275/W,y:350/H}));
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const t=Math.PI+2*Math.PI*i/ids.length;face[id]={x:(cx+rx*Math.cos(t))/W,y:(cy+ry*Math.sin(t))/H}});
 ellipse(C.eyes[0],205,312,31,12);ellipse(C.eyes[1],345,312,31,12);ellipse(C.brows[0],205,269,48,7);ellipse(C.brows[1],345,268,48,7);ellipse(C.lips,278,461,47,15);
 face[10]={x:275/W,y:150/H};face[152]={x:275/W,y:551/H};
 const mask=Object.assign(document.createElement('canvas'),{width:W,height:H}),m=mask.getContext('2d');m.fillStyle='white';
 for(const points of [[[145,260],[180,195],[225,170],[270,145],[300,155],[340,185],[385,205],[410,270],[425,335],[406,420],[367,490],[330,535],[275,555],[220,535],[175,490],[141,420],[122,330]],[[199,510],[356,510],[360,605],[414,637],[151,637],[190,600]]]){m.beginPath();points.forEach(([x,y],i)=>i?m.lineTo(x,y):m.moveTo(x,y));m.closePath();m.fill()}
 const before=Object.assign(document.createElement('canvas'),{width:W,height:H});before.getContext('2d').drawImage(im,0,0);
 const after=await preparePreAiSkin(im,mask,face,{finish:'post'}),a=before.getContext('2d').getImageData(0,0,W,H).data,z=after.getContext('2d').getImageData(0,0,W,H).data;
 let changed=0,maxDelta=0;for(let i=0;i<a.length;i+=4){if(a[i+3]!==z[i+3])throw Error('alpha changed');for(let c=0;c<3;c++)maxDelta=Math.max(maxDelta,Math.abs(a[i+c]-z[i+c]));if([0,1,2].some(c=>a[i+c]!==z[i+c]))changed++}
 if(after.width!==W||after.height!==H||maxDelta>13)throw Error('unexpected geometry/strength');
 for(const [label,c]of [['Original',before],['Prepared',after]]){const panel=document.createElement('div');panel.style='display:inline-block;vertical-align:top;margin-right:10px';panel.append(label,document.createElement('br'),c);document.body.append(panel)}
 return {fixture:'real portrait with hand-labelled skin/feature regions',changedPixels:changed,maxChannelDelta:maxDelta,dimensionsUnchanged:true,stats:after.idpromSkinPreparation,paidAiCalls:0};
 }''')
 assert not blocked,blocked
 Path('work/post-ai-skin').mkdir(parents=True,exist_ok=True);p.screenshot(path='work/post-ai-skin/portrait-comparison.png',full_page=True)
 print(json.dumps(result,indent=2));b.close()
