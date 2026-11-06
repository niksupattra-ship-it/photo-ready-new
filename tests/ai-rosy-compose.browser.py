"""AI result composition with synthetic provider pixels; all external requests blocked."""
from playwright.sync_api import sync_playwright
import json
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page();external=[]
 def route(r):
  if r.request.url.startswith('http://127.0.0.1:5192/'):r.continue_()
  else:external.append(r.request.url);r.abort()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/compose-portrait-before.js')
 result=p.evaluate('''async()=>{
 const {composeAiRosyMakeup,checkAiRosyGeometry}=await import('/src/ai-rosy-compose.js'),{LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
 const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),read=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data,assert=(v,s)=>{if(!v)throw Error(s)};
 const W=320,H=420,original=canvas(W,H),generated=canvas(W,H),skinMask=canvas(W,H),hairMask=canvas(W,H);
 const face=Array.from({length:478},()=>({x:.5,y:.5})),oval=(ids,cx,cy,rx,ry,top=false)=>ids.forEach((id,j)=>{const a=j/ids.length*Math.PI*2;face[id]={x:cx+rx*(top?Math.sin(a):Math.cos(a)),y:cy+ry*(top?-Math.cos(a):Math.sin(a))}});
 oval(C.face,.5,.44,.31,.35,true);
 for(let side=0;side<2;side++){
  const cx=side?.65:.35;oval(C.eyes[side],cx,.36,.065,.02);oval(C.brows[side],cx,.29,.07,.014);
  const center=side?473:468;face[center]={x:cx,y:.36};for(let k=1;k<=4;k++){const a=(k-1)*Math.PI/2;face[center+k]={x:cx+Math.cos(a)*.018,y:.36+Math.sin(a)*.018*W/H}}
 }
 oval(C.lips,.5,.62,.10,.03);oval(C.mouth,.5,.62,.07,.004);
 for(const [id,x,y]of [[1,.5,.50],[98,.47,.51],[327,.53,.51]])face[id]={x,y};
 checkAiRosyGeometry(face,W,H,face,W,H);
 const ox=original.getContext('2d'),gx=generated.getContext('2d'),sx=skinMask.getContext('2d'),hx=hairMask.getContext('2d');
 ox.fillStyle='#3474ce';ox.fillRect(0,0,W,H);ox.fillStyle='#bc9580';ox.beginPath();ox.ellipse(W*.5,H*.44,W*.31,H*.35,0,0,Math.PI*2);ox.fill();ox.fillRect(W*.4,H*.73,W*.2,H*.2);
 sx.fillStyle='#fff';sx.beginPath();sx.ellipse(W*.5,H*.44,W*.31,H*.35,0,0,Math.PI*2);sx.fill();sx.fillRect(W*.4,H*.73,W*.2,H*.2);
 ox.fillStyle='#241e1b';ox.fillRect(W*.15,H*.08,W*.1,H*.55);hx.fillStyle='#fff';hx.fillRect(W*.15,H*.08,W*.1,H*.55);ox.clearRect(0,0,12,H);
 gx.fillStyle='#edc9c4';gx.fillRect(0,0,W,H);const source=read(original).slice(),skin=read(skinMask),hair=read(hairMask),out=await composeAiRosyMakeup({original,generated,face,generatedFace:face,hairMask,skinMask}),after=read(out);
 assert(out.width===W&&out.height===H,'Native geometry changed');let changed=0;
 for(let i=0;i<W*H;i++){
  const j=i*4;assert(after[j+3]===source[j+3],'Alpha changed');
  if(source[j+3]===0||hair[j+3]>16)for(let c=0;c<3;c++)assert(after[j+c]===source[j+c],'Hair/transparent pixels changed');
  if(after[j]!==source[j])changed++;
 }
 const center=(x,y)=>Math.floor(y*H)*W+Math.floor(x*W);
 for(const [x,y]of [[.04,.5],[.95,.5],[.2,.4],[.35,.36],[.65,.36],[.5,.62]]){const j=center(x,y)*4;for(let c=0;c<4;c++)assert(after[j+c]===source[j+c],'Protected sample changed '+x+','+y)}
 assert(after[center(.5,.86)*4]>source[center(.5,.86)*4],'Neck did not receive AI pixels');assert(changed>W*H*.1,'AI cosmetics were not applied');
 const unchanged=read(original);assert(source.every((v,i)=>v===unchanged[i]),'Source mutated');
 const wrong=structuredClone(face);wrong[152].y+=.2;let rejected=false;try{await composeAiRosyMakeup({original,generated,face,generatedFace:wrong,hairMask,skinMask})}catch{rejected=true}assert(rejected,'Stretched face accepted');
 const stop=new AbortController();stop.abort();let aborted=false;try{await composeAiRosyMakeup({original,generated,face,generatedFace:face,hairMask,skinMask,signal:stop.signal})}catch(e){aborted=e.name==='AbortError'}assert(aborted,'Cancellation ignored');
 return {nativeSize:true,alphaUnchanged:true,hairAndBackgroundProtected:true,eyeAndMouthInteriorsProtected:true,neckUsesAiPixels:true,changedPixels:changed,wrongGeometryRejected:true,cancelled:true};
}''')
 b.close();assert not external,external
print(json.dumps(result,indent=2))
