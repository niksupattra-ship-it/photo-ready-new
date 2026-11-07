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
 const mask=make(),mx=mask.getContext('2d');mx.fillStyle='white';mx.fillRect(80,55,200,350);
 const face=[];for(const [id,xx,y]of [[33,130,160],[263,230,160],[10,180,60],[152,180,300]])face[id]={x:xx/W,y:y/H};
 const run=uneven=>{const c=make(),x=c.getContext('2d');x.fillStyle='#2060a0';x.fillRect(0,0,W,H);x.fillStyle='#bd917a';x.fillRect(80,55,200,350);
 const d=x.getImageData(0,0,W,H);for(let y=55;y<405;y++)for(let xx=80;xx<280;xx++){const i=(y*W+xx)*4,noise=((xx*17+y*11)%9-4)*2,shade=uneven&&xx<155?35:0;for(let k=0;k<3;k++)d.data[i+k]+=noise-shade}x.putImageData(d,0,0);
 x.fillStyle='#241b18';for(const [xx,yy,w]of [[120,124,40],[130,159,20],[165,210,30],[160,250,40]])x.fillRect(xx,yy,w,2);
 const before=x.getImageData(0,0,W,H).data.slice(),out=preparePreAiSkin(c,mask,face),after=out.getContext('2d').getImageData(0,0,W,H).data;
 let changed=0,outside=0;for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const i=(y*W+xx)*4,diff=[0,1,2,3].some(k=>before[i+k]!==after[i+k]);if(diff)changed++;if((xx<80||xx>=280||y<55||y>=405)&&diff)outside++;if(before[i+3]!==after[i+3])throw Error('alpha changed')}
 for(const [xx,yy]of [[140,124],[140,159],[180,210],[180,250]]){const i=(yy*W+xx)*4;if([0,1,2,3].some(k=>before[i+k]!==after[i+k]))throw Error('feature edge changed')}
 if(outside||out.width!==W||out.height!==H||x.getImageData(0,0,W,H).data.some((v,i)=>v!==before[i]))throw Error('outside/source/geometry changed');
 if(uneven&&!changed)throw Error('uneven skin not corrected');if(!uneven&&changed)throw Error('even skin unnecessarily changed: '+changed);
 // Texture remains visible because only low-frequency additive light changes.
 const energy=data=>{let total=0,n=0;for(let yy=180;yy<220;yy++)for(let xx=95;xx<125;xx++){const i=(yy*W+xx)*4;total+=Math.abs(data[i]-data[i+4]);n++}return total/n};
 if(energy(after)<energy(before)*.9)throw Error('texture blurred');
 return {uneven,changedPixels:changed,outsidePixelsChanged:outside,textureBefore:energy(before),textureAfter:energy(after),browEyeEdgesPreserved:true};};
 return {evenSkin:run(false),unevenSkin:run(true),paidAiCalls:0};
 }''')
 assert not external,external
 print(json.dumps(result,indent=2));b.close()
