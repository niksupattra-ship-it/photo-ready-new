from playwright.sync_api import sync_playwright
import json
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page();external=[]
 def route(r):
  if not r.request.url.startswith('http://127.0.0.1:5192/') or '/api/' in r.request.url:external.append(r.request.url);r.abort();return
  if r.request.url.endswith('/__pre_skin'):r.fulfill(content_type='text/html',body='<html><body></body></html>');return
  r.continue_()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/__pre_skin')
 result=p.evaluate('''async()=>{
 const {preparePreAiSkin}=await import('/src/pre-ai-skin.js');
 const W=360,H=480,make=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
 const c=make(),x=c.getContext('2d');x.fillStyle='#2060a0';x.fillRect(0,0,W,H);x.fillStyle='#bd917a';x.fillRect(80,55,200,350);
 const d=x.getImageData(0,0,W,H);for(let y=55;y<405;y++)for(let xx=80;xx<280;xx++){const i=(y*W+xx)*4,noise=((xx*17+y*11)%9-4)*3;for(let k=0;k<3;k++)d.data[i+k]+=noise}x.putImageData(d,0,0);
 const mask=make(),mx=mask.getContext('2d');mx.fillStyle='white';mx.fillRect(80,55,200,350);
 const face=[];for(const [id,xx,y]of [[33,130,160],[263,230,160],[10,180,60],[152,180,300],[234,85,190],[454,275,190],[70,125,125],[107,155,125],[336,205,125],[300,235,125],[61,155,250],[291,205,250],[13,180,247],[14,180,255],[98,165,210],[327,195,210]])face[id]={x:xx/W,y:y/H};
 const before=x.getImageData(0,0,W,H).data.slice(),out=preparePreAiSkin(c,mask,face),after=out.getContext('2d').getImageData(0,0,W,H).data;
 let changed=0,protectedChanged=0;for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const i=(y*W+xx)*4,diff=[0,1,2,3].some(k=>before[i+k]!==after[i+k]);if(diff)changed++;if((xx<80||xx>=280||y<55||y>=405||xx>=115&&xx<245&&y>=145&&y<175||xx>=147&&xx<213&&y>=239&&y<263)&&diff)protectedChanged++}
 const energy=data=>{let sum=0,n=0;for(let y=185;y<225;y++)for(let xx=90;xx<125;xx++){const i=(y*W+xx)*4;sum+=Math.abs(data[i]-data[i+4]);n++}return sum/n};
 if(!changed||protectedChanged||energy(after)>=energy(before)||out.width!==W||out.height!==H)throw Error(JSON.stringify({changed,protectedChanged,before:energy(before),after:energy(after)}));
 if(x.getImageData(0,0,W,H).data.some((v,i)=>v!==before[i]))throw Error('source mutated');
 let rejected=false;try{preparePreAiSkin(c,null,face)}catch{rejected=true}if(!rejected)throw Error('missing mask accepted');
 return {changedSkinPixels:changed,protectedPixelsChanged:protectedChanged,textureContrastBefore:energy(before),textureContrastAfter:energy(after),dimensionsUnchanged:true,sourceUnchanged:true,missingMaskRejected:true};
 }''')
 assert not external,external
 print(json.dumps(result,indent=2));b.close()
