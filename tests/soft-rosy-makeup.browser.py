"""Native cosmetic pixels and legacy-look equality; synthetic faces, no services."""
import pathlib,json
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
before=(root/'scripts/fixtures/local-skin-before-soft-rosy.js').read_text()
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page();external=[]
 def route(r):
  if not r.request.url.startswith('http://127.0.0.1:5192/'):external.append(r.request.url);r.abort();return
  r.continue_()
 p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/compose-portrait-before.js')
 report=p.evaluate('''async before=>{
 const {renderLocalSkin}=await import('/src/local-skin.js'),{LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
 const oldUrl=URL.createObjectURL(new Blob([before.replaceAll("from './","from 'http://127.0.0.1:5192/src/")],{type:'text/javascript'}));
 const old=(await import(oldUrl)).renderLocalSkin;URL.revokeObjectURL(oldUrl);
 const assert=(ok,msg)=>{if(!ok)throw Error(msg)},surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const read=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
 const results=[];
 for(const W of [192,384]){
  const H=Math.round(W*4/3),original=surface(W,H),ctx=original.getContext('2d'),skinMask=surface(W,H),sx=skinMask.getContext('2d'),hairMask=surface(W,H),hx=hairMask.getContext('2d');
  const face=Array.from({length:478},()=>({x:.5,y:.5}));
  const oval=(ids,cx,cy,rx,ry,top=false)=>ids.forEach((id,j)=>{const a=j/ids.length*Math.PI*2;face[id]={x:cx+rx*(top?Math.sin(a):Math.cos(a)),y:cy+ry*(top?-Math.cos(a):Math.sin(a))}});
  oval(C.face,.5,.45,.31,.36,true);
  for(let side=0;side<2;side++){oval(C.eyes[side],side?.64:.36,.38,.065,.02);oval(C.brows[side],side?.64:.36,.31,.075,.014)}
  oval(C.lips,.5,.64,.10,.035);oval(C.mouth,.5,.64,.07,.006);
  for(const [id,x,y]of [[1,.5,.51],[4,.5,.55],[98,.47,.52],[327,.53,.52],[50,.34,.55],[280,.66,.55],[117,.35,.49],[346,.65,.49],[151,.5,.18]])face[id]={x,y};
  const ellipse=(x,y,cx,cy,rx,ry)=>((x-cx)/rx)**2+((y-cy)/ry)**2<1;
  const pixels=ctx.createImageData(W,H),skin=sx.createImageData(W,H),hair=hx.createImageData(W,H),labels=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,j=i*4,px=(x+.5)/W,py=(y+.5)/H,inside=ellipse(px,py,.5,.45,.31,.36)||(px>.40&&px<.60&&py>.74&&py<.96);
   const grain=3*Math.sin(x*1.7)*Math.cos(y*1.4);let color=inside?[183+grain,146+grain,127+grain]:[65,125,220];labels[i]=inside?1:0;
   if(inside)skin.data[j+3]=255;
   if(!inside&&px>.16&&px<.84&&py<.25){color=[34,28,26];hair.data[j+3]=255;labels[i]=2}
   for(const cx of [.36,.64]){
    if(ellipse(px,py,cx,.38,.045,.008)){color=[42,35,31];labels[i]=3}
    if(ellipse(px,py,cx,.31,.055,.006)){color=[63,49,43];labels[i]=4}
   }
   if(ellipse(px,py,.5,.64,.085,.025)){color=[178,86,111];labels[i]=5}
   pixels.data.set([...color,(x<3||y<3)?0:255],j);
  }
  ctx.putImageData(pixels,0,0);sx.putImageData(skin,0,0);hx.putImageData(hair,0,0);const source=read(original).slice();
  const params={original,face,hairMask,skinMask};
  for(const lookId of ['skin-bright-v1','skin-glow-v1','skin-smooth-v1']){
   const a=read(await old({...params,lookId})),b=read(await renderLocalSkin({...params,lookId}));assert(a.every((v,i)=>v===b[i]),'Legacy look pixels changed: '+lookId);
  }
  const progress=[],out=await renderLocalSkin({...params,lookId:'soft-rosy-makeup-v1',onProgress:n=>progress.push(n)}),after=read(out);
  assert(out.width===W&&out.height===H,'Native size changed');const unchanged=read(original);assert(source.every((v,i)=>v===unchanged[i]),'Original mutated');
  let skinLift=0,neckLift=0,skinN=0,neckN=0,lipChanges=0,browChanges=0;
  for(let i=0;i<labels.length;i++){
   const j=i*4;assert(after[j+3]===source[j+3],'Alpha changed');
   if(labels[i]===0||labels[i]===2||labels[i]===3||source[j+3]===0)for(let c=0;c<3;c++)assert(after[j+c]===source[j+c],'Background, hair or transparent pixels changed');
   if(labels[i]===1){skinLift+=after[j]-source[j];skinN++;if(i/W>H*.84){neckLift+=after[j]-source[j];neckN++}}
   if(labels[i]===5&&after[j]!==source[j])lipChanges++;
   if(labels[i]===4&&after[j]<source[j])browChanges++;
  }
  assert(skinLift/skinN>3&&neckLift/neckN>3,'Face/neck did not brighten together');assert(lipChanges>0&&browChanges>0,'Cosmetic regions unchanged');
  assert(progress.every((v,i)=>!i||v>=progress[i-1]),'Progress moved backwards');
  const controller=new AbortController();controller.abort();let cancelled=false;try{await renderLocalSkin({...params,lookId:'soft-rosy-makeup-v1',signal:controller.signal})}catch(e){cancelled=e.name==='AbortError'}assert(cancelled,'Cancellation ignored');
  results.push({width:W,height:H,legacyPixelsIdentical:true,nativeGeometryAndAlphaPreserved:true,hairAndBackgroundPreserved:true,faceAndNeckBrighter:true,lipsAndBrowsChanged:true,cancellation:true});
 }
 const {createMakeupLookCache,blendLookIntensity}=await import('/src/makeup-look-tools.js');const cache=createMakeupLookCache();let calls=0;
 const generate=()=>{calls++;return Promise.resolve('look-'+calls)};
 const a=await cache.get('head','base','skin-smooth-v1',generate),b=await cache.get('head','base','soft-rosy-makeup-v1',generate),c=await cache.get('head','base','soft-rosy-makeup-v1',generate);
 assert(a!==b&&b===c&&calls===2,'Look caches overlap');
 const original=new Uint8ClampedArray([100,90,80,128]),full=new Uint8ClampedArray([150,130,120,128]);assert(blendLookIntensity(original,full,0).every((v,i)=>v===original[i]),'Zero intensity not original');
 return results;
}''',before)
 b.close();assert not external,external
print(json.dumps(report,indent=2))
