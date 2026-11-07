from playwright.sync_api import sync_playwright
import json
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page();external=[]
 def route(r):
  if not r.request.url.startswith('http://127.0.0.1:5192/') or '/api/' in r.request.url:external.append(r.request.url);r.abort();return
  if r.request.url.endswith('/__pre_skin'):r.fulfill(content_type='text/html',body='<html></html>');return
  r.continue_()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/__pre_skin')
 result=p.evaluate('''async()=>{
 const {preparePreAiSkin}=await import('/src/pre-ai-skin.js');
 const {LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
 const W=360,H=480,make=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
 const face=Array.from({length:478},()=>({x:.5,y:.5}));
 const ellipse=(ids,cx,cy,rx,ry)=>ids.forEach((id,i)=>{const t=Math.PI+2*Math.PI*i/ids.length;face[id]={x:(cx+rx*Math.cos(t))/W,y:(cy+ry*Math.sin(t))/H}});
 ellipse(C.eyes[0],130,160,20,7);ellipse(C.eyes[1],230,160,20,7);
 ellipse(C.brows[0],130,130,24,4);ellipse(C.brows[1],230,130,24,4);ellipse(C.lips,180,250,25,7);
 face[10]={x:.5,y:60/H};face[152]={x:.5,y:300/H};
 const mask=make(),mx=mask.getContext('2d');mx.fillStyle='white';mx.fillRect(80,55,200,350);
 const run=async kind=>{
  const source=make(),x=source.getContext('2d');x.fillStyle='#2060a0';x.fillRect(0,0,W,H);x.fillStyle='#bd917a';x.fillRect(80,55,200,350);
  if(kind==='uneven'){
   const d=x.getImageData(0,0,W,H);for(let y=55;y<405;y++)for(let xx=80;xx<280;xx++){const i=(y*W+xx)*4,shade=xx<170?-30:xx>230?18:0,grain=((xx+y)%2?2:-2);for(let k=0;k<3;k++)d.data[i+k]+=shade+grain}x.putImageData(d,0,0);
  }
  if(kind==='blemish'){x.fillStyle='#c96863';x.fillRect(118,200,4,4);x.fillStyle='#302420';x.fillRect(223,212,3,3)}
  x.fillStyle='#241b18';for(const [xx,yy,w]of [[120,129,20],[220,129,20],[120,159,20],[220,159,20],[170,249,20]])x.fillRect(xx,yy,w,2);
  const before=x.getImageData(0,0,W,H).data.slice(),out=await preparePreAiSkin(source,mask,face),after=out.getContext('2d').getImageData(0,0,W,H).data;
  let changed=0,outside=0;for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const i=(y*W+xx)*4,diff=[0,1,2].some(k=>before[i+k]!==after[i+k]);if(diff)changed++;if((xx<80||xx>=280||y<55||y>=405)&&diff)outside++;if(before[i+3]!==after[i+3])throw Error('alpha changed')}
  for(const [xx,yy]of [[130,129],[230,129],[130,159],[230,159],[180,249]]){const i=(yy*W+xx)*4;if([0,1,2,3].some(k=>before[i+k]!==after[i+k]))throw Error('feature changed: '+kind)}
  if(outside||out.width!==W||out.height!==H||x.getImageData(0,0,W,H).data.some((v,i)=>v!==before[i]))throw Error('source/outside/geometry changed');
  if(kind==='even'&&changed)throw Error('even skin changed: '+changed);
  const average=(data,l,r)=>{let sum=0,n=0;for(let y=185;y<225;y++)for(let xx=l;xx<r;xx++){sum+=data[(y*W+xx)*4];n++}return sum/n};
  if(kind==='uneven'){
   const a=average(before,240,260)-average(before,105,125),b=average(after,240,260)-average(after,105,125);if(!(b<a&&b>0))throw Error('light not softened');
   let e1=0,e2=0;for(let yy=185;yy<225;yy++)for(let xx=100;xx<120;xx++){const j=(yy*W+xx)*4;e1+=Math.abs(before[j]-before[j+4]);e2+=Math.abs(after[j]-after[j+4])}if(e2<e1*.8)throw Error('texture blurred');
  }
  if(kind==='blemish'){
   const mole=(213*W+224)*4;if([0,1,2].some(k=>before[mole+k]!==after[mole+k]))throw Error('mole changed');
   const spot=(201*W+119)*4;if(after[spot]-after[spot+1]>=before[spot]-before[spot+1])throw Error('red spot not reduced');
  }
  return {kind,changedPixels:changed,outsidePixelsChanged:outside,featureEdgesPreserved:true,dimensionsUnchanged:true,stats:out.idpromSkinPreparation};
 };
 return {cases:[await run('even'),await run('uneven'),await run('blemish')],paidAiCalls:0};
 }''')
 assert not external,external
 print(json.dumps(result,indent=2));b.close()
