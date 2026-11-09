"""Shared native skin base and old-tone cosmetics, with real browser pixels.
No provider, account, payment, or external network calls.
"""
import http.server,json,os,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=pathlib.Path(os.environ.get('SHARED_SKIN_OUTPUT','/tmp/shared-studio-skin'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
try:
 with sync_playwright()as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page();errors=[];network=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def route(request):
   if not request.request.url.startswith(base+'/')or'/api/'in request.request.url:network.append(request.request.url);request.abort();return
   if request.request.url==base+'/':request.fulfill(status=200,content_type='text/html',body='<!doctype html><title>Shared skin base checks</title>');return
   request.continue_()
  page.route('**/*',route);page.goto(base+'/')
  results=page.evaluate(r'''async()=>{
   const {LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
   const {finishStudioPostCosmetics}=await import('/src/studio-post-cosmetics.js');
   const {finishSharedStudioSkin,isStudioSkinBaseSource,sharedStudioSkinSource,canReuseStudioSkinBase,studioSkinBlobFromSource}=await import('/src/shared-studio-skin.js');
   const {STUDIO_SKIN_WORKFLOW_VERSION:VERSION}=await import('/studio-skin-treatment.js');
   const {NATURAL_STUDIO_SKIN_VERSION:NATURAL}=await import('/natural-studio-skin.js');
   const assert=(value,message)=>{if(!value)throw Error(message)},reports=[];
   const test=async(name,run)=>{const detail=await run();reports.push({name,...detail})};
   const canvas=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
   const read=surface=>surface.getContext('2d',{willReadFrequently:true}).getImageData(0,0,surface.width,surface.height).data;
   const equal=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
   const png=surface=>new Promise((resolve,reject)=>surface.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encode failed')),'image/png'));
   const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
   const decode=async blob=>{const image=await createImageBitmap(blob),out=canvas(image.width,image.height);out.getContext('2d').drawImage(image,0,0);image.close();return out};
   const source=(W=384,tone=[184,141,123])=>{
    const H=Math.round(W*4/3),face=Array.from({length:478},()=>({x:.5,y:.5}));
    const oval=(ids,cx,cy,rx,ry,top=false)=>ids.forEach((id,j)=>{const a=j/ids.length*Math.PI*2;face[id]={x:cx+rx*(top?Math.sin(a):-Math.cos(a)),y:cy+ry*(top?-Math.cos(a):-Math.sin(a))}});
    oval(C.face,.5,.48,.33,.40,true);
    for(let side=0;side<2;side++){
     const cx=side?.64:.36;oval(C.eyes[side],cx,.41,.066,.020);oval(C.brows[side],cx,.32,.078,.015);
     C.upperLids[side].forEach((id,j,ids)=>{const a=j/(ids.length-1)*Math.PI;face[id]={x:cx+(side?1:-1)*.066*Math.cos(a),y:.41-.020*Math.sin(a)}});
     C.eyes[side].slice(C.upperLids[side].length).forEach((id,j,ids)=>{const a=(j+1)/(ids.length+1)*Math.PI;face[id]={x:cx+(side?-1:1)*.066*Math.cos(a),y:.41+.020*Math.sin(a)}});
    }
    oval(C.lips,.5,.68,.095,.028);oval(C.mouth,.5,.68,.074,.009);
    for(const[id,x,y]of[[1,.5,.565],[4,.5,.55],[98,.468,.565],[327,.532,.565],[168,.5,.47],[50,.33,.55],[280,.67,.55],[117,.34,.5],[346,.66,.5],[151,.5,.22]])face[id]={x,y};
    const original=canvas(W,H),ctx=original.getContext('2d'),data=ctx.createImageData(W,H),skinMask=canvas(W,H),hairMask=canvas(W,H),skin=skinMask.getContext('2d').createImageData(W,H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
     const j=(y*W+x)*4,px=(x+.5)/W,py=(y+.5)/H,inside=((px-.5)/.33)**2+((py-.48)/.40)**2<1;
     let color=inside?tone.map(v=>v+8*(px-.5)+5*Math.sin(py*4)+4*Math.sin(x*1.7)*Math.cos(y*1.4)):[72,137,199];
     if(((px-.5)/.085)**2+((py-.68)/.026)**2<1)color=[150,76,91].map(v=>v+3*Math.sin(x*1.7)*Math.cos(y*1.4));
     const alpha=x<3&&y<3?0:255;
     for(let c=0;c<3;c++)data.data[j+c]=alpha?color[c]:0;data.data[j+3]=alpha;skin.data[j+3]=inside?255:0;
    }
    ctx.putImageData(data,0,0);skinMask.getContext('2d').putImageData(skin,0,0);
    return {original,face,hairMask,skinMask};
   };
   for(const[width,tone]of[[384,[184,141,123]],[900,[108,77,63]]])await test('one exact skin base for Natural, Makeup and restored Natural at '+width,async()=>{
    const f=source(width,tone),input=await png(f.original),inputBytes=new Uint8Array(await input.arrayBuffer()),inputPixels=read(f.original).slice();
    Object.assign(input,{idpromStudioSkinVersion:VERSION,idpromJobId:'same-accepted-job',idpromTrial:true,idpromFullEdit:false});let encodes=0,prepares=0;
    const options={encodeBase:async blob=>{encodes++;assert(blob===input,'only the cleaned bare output may initialize base');return dataURL(blob)},prepare:async blob=>{prepares++;assert(equal(new Uint8Array(await blob.arrayBuffer()),inputBytes),'cosmetics started from pixels with previous makeup');return {...f,original:await decode(blob)}},toBlob:png};
    const natural=await finishSharedStudioSkin(input,{...options,style:'natural'});
    const madeUp=await finishSharedStudioSkin(natural,{...options,style:'makeup'});
    const restored=await finishSharedStudioSkin(madeUp,{...options,style:'natural'});
    const remade=await finishSharedStudioSkin(restored,{...options,style:'makeup'});
    assert(encodes===1,'switching finish encoded a new base');assert(prepares===2,'Natural prepared or makeup stacked');
    const common=sharedStudioSkinSource(natural);assert(common&&sharedStudioSkinSource(madeUp)===common&&sharedStudioSkinSource(restored)===common&&sharedStudioSkinSource(remade)===common,'shared base changed between choices');
    assert(equal(new Uint8Array(await restored.arrayBuffer()),inputBytes),'Natural did not recover exact base bytes');
    assert(equal(new Uint8Array(await remade.arrayBuffer()),new Uint8Array(await madeUp.arrayBuffer())),'makeup output accumulated or changed on repeat');
    assert(restored.idpromNaturalStudioSkinVersion===NATURAL&&!restored.idpromStudioCosmeticsVersion,'Natural marker is inconsistent');assert(madeUp.idpromStudioCosmeticsVersion===VERSION+':makeup'&&!madeUp.idpromNaturalStudioSkinVersion,'Makeup retained Natural marker');
    const result=await decode(madeUp),after=read(result);let changed=0,skin=0;
    assert(result.width===f.original.width&&result.height===f.original.height,'native size changed');
    for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){
     const i=(y*result.width+x)*4,px=(x+.5)/result.width,py=(y+.5)/result.height,lip=px>.395&&px<.605&&py>.645&&py<.715,upper=px>.275&&px<.725&&py>.35&&py<.415;
     assert(after[i+3]===inputPixels[i+3],'alpha changed');
     const different=[0,1,2].some(c=>after[i+c]!==inputPixels[i+c]);if(different){changed++;assert(lip||upper,'makeup changed bare skin outside accepted cosmetic regions')}
     if(!lip&&!upper){skin++;for(let c=0;c<4;c++)assert(after[i+c]===inputPixels[i+c],'skin/light/texture changed')}
    }
    assert(changed>50,'makeup is missing');
    for(const result of[natural,madeUp,restored,remade])assert(result.idpromJobId==='same-accepted-job'&&result.idpromTrial===true&&result.idpromFullEdit===false,'job or rights changed');
    assert(!input.idpromStudioSkinBaseSource&&!input.idpromStudioCosmeticsVersion,'source Blob metadata mutated');assert(equal(new Uint8Array(await input.arrayBuffer()),inputBytes),'source bytes mutated');
    return {width:result.width,height:result.height,changedCosmeticPixels:changed,exactSkinPixels:skin,baseEncodes:encodes,cosmeticPasses:prepares,providerCalls:0};
   });
   await test('Makeup retains the previously accepted local palette exactly',async()=>{
    const f=source(),input=await png(f.original);input.idpromStudioSkinVersion=VERSION;
    const options={prepare:async blob=>({...f,original:await decode(blob)}),toBlob:png};
    for(const style of['makeup','korean-rosy-v1','soft-rosy-v1']){
     const old=await finishStudioPostCosmetics(input,{...options,style});
     const shared=await finishSharedStudioSkin(input,{...options,style,encodeBase:dataURL});
     assert(equal(read(await decode(old)),read(await decode(shared))),'old cosmetic palette changed for '+style);
    }
    return {styles:3,oldPalettePixelsExact:true};
   });
   await test('unreliable, old and manually edited heads do not enter local finish reuse',async()=>{
    const encoded=await dataURL(await png(source().original)),head={jobId:'accepted',portraitMode:'female',studioSkinVersion:VERSION,studioSkinBaseSource:encoded};
    assert(canReuseStudioSkinBase(head),'valid processed head cannot reuse shared base');
    for(const extra of[{studioSkinVersion:'older-staged-version'},{studioSkinBaseSource:null},{jobId:''},{portraitMode:'male'},{mask:encoded},{warpSource:encoded},{warpBaseMask:encoded},{eraseRestoreSource:encoded},{warpRestoreBase:encoded},{makeupStyles:{look:'manual-skin-look'}}])assert(!canReuseStudioSkinBase({...head,...extra}),'unsafe local reuse '+Object.keys(extra));
    for(const invalid of[null,{},'https://example.invalid/source.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,AAAA\n'])assert(!isStudioSkinBaseSource(invalid),'accepted invalid base source');
    assert((await studioSkinBlobFromSource(encoded).arrayBuffer()).byteLength>0,'stored source did not decode');
    return {rejectedUnsafeVariants:10};
   });
   await test('failed preparation and cancellation never publish a partially finished variant',async()=>{
    const input=await png(source().original);input.idpromStudioSkinVersion=VERSION;input.idpromJobId='accepted';let encodes=0,prepares=0,cancelled=false;
    const encodeBase=async blob=>{encodes++;const source=await dataURL(blob);cancelled=true;return source};
    try{await finishSharedStudioSkin(input,{style:'makeup',encodeBase,signal:{get aborted(){return cancelled}},prepare:async()=>{prepares++;throw Error('unexpected prepare')},toBlob:png});throw Error('cancelled finish was accepted')}catch(error){assert(error.name==='AbortError','wrong canceled result')}
    assert(encodes===1&&prepares===0&&!input.idpromStudioSkinBaseSource&&!input.idpromStudioCosmeticsVersion,'cancelled stage mutated accepted image');
    try{await finishSharedStudioSkin(input,{style:'makeup',encodeBase:dataURL,prepare:async()=>{throw Error('evidence failed')},toBlob:png});throw Error('failed finish was accepted')}catch(error){assert(error.message==='evidence failed','wrong evidence failure')}
    assert(input.idpromJobId==='accepted'&&!input.idpromStudioCosmeticsVersion&&!input.idpromStudioSkinBaseSource,'failed stage changed job/base');
    return {cancelBeforePrepare:true,acceptedImageIntact:true};
   });
   await test('current Korean Makeup brightens skin, adds glossy lips and defined lashes without moving pixels',async()=>{
    const {ORIGINAL_PORTRAIT_AI_VERSION:CURRENT}=await import('/original-portrait-ai.js');
    const {renderLocalMakeup}=await import('/src/local-makeup.js');
    const {SHARED_PORTRAIT_BASE_VERSION}=await import('/shared-portrait-policy.js');
    const samples=[];
    for(const width of [384,900]){
     const f=source(width,width===900?[108,77,63]:[184,141,123]),before=read(f.original).slice(),input=await png(f.original);input.idpromStudioSkinVersion=CURRENT;input.idpromJobId='current-job';
     const options={encodeBase:dataURL,prepare:async blob=>({...f,original:await decode(blob)}),toBlob:png};
     const natural=await finishSharedStudioSkin(input,{...options,style:'natural'}),makeup=await finishSharedStudioSkin(natural,{...options,style:'makeup'}),restored=await finishSharedStudioSkin(makeup,{...options,style:'natural'});
     assert(equal(new Uint8Array(await restored.arrayBuffer()),new Uint8Array(await input.arrayBuffer())),'Natural did not restore exact unpainted bytes');
     const result=await decode(makeup),after=read(result),legacy=read(await renderLocalMakeup({...f,lookId:'shared-rose-pink-v1',cosmeticsOnly:true}));
     assert(result.width===f.original.width&&result.height===f.original.height,'makeup resized/warped the image');
     const strong=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v3',cosmeticsOnly:true}));
     let skinLift=0,skinCount=0,glossGain=0,lashGain=0,lipNude=0,lipStrong=0,lipCount=0,eyeNude=0,eyeStrong=0,eyeCount=0,cheekGain=0,cheekCount=0;
     for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++){
      const i=(y*result.width+x)*4,px=(x+.5)/result.width,py=(y+.5)/result.height;
      assert(after[i+3]===before[i+3],'alpha changed');
      const inFace=((px-.5)/.33)**2+((py-.48)/.40)**2<1;
      if(!inFace)for(let c=0;c<4;c++)assert(after[i+c]===before[i+c],'hair/background/silhouette changed');
      if(px>.36&&px<.64&&py>.50&&py<.60){skinLift+=(after[i]+after[i+1]+after[i+2]-before[i]-before[i+1]-before[i+2])/3;skinCount++}
      if((Math.abs(px-.33)<.04||Math.abs(px-.67)<.04)&&py>.52&&py<.58){cheekGain+=after[i]-after[i+1]-strong[i]+strong[i+1];cheekCount++}
      if(px>.43&&px<.57&&py>.687&&py<.701){lipNude+=after[i]-after[i+1];lipStrong+=strong[i]-strong[i+1];lipCount++}
      if((Math.abs(px-.36)<.04||Math.abs(px-.64)<.04)&&py>.365&&py<.39){eyeNude+=after[i]-after[i+1];eyeStrong+=strong[i]-strong[i+1];eyeCount++}
      if(px>.40&&px<.60&&py>.68&&py<.71)glossGain=Math.max(glossGain,(after[i]+after[i+1]+after[i+2]-legacy[i]-legacy[i+1]-legacy[i+2])/3);
      if(px>.27&&px<.73&&py>.365&&py<.415&&after[i]+after[i+1]+after[i+2]<legacy[i]+legacy[i+1]+legacy[i+2]-3)lashGain++;
      if((Math.abs(px-.36)<.02||Math.abs(px-.64)<.02)&&Math.abs(py-.41)<.006)for(let c=0;c<3;c++)assert(after[i+c]===before[i+c],'eye interior changed');
     }
     assert(skinCount>0&&skinLift/skinCount>2,'skin was not visibly brighter');assert(glossGain>4,'lip gloss did not increase');assert(lashGain>3,'Korean lash definition did not increase');
     assert((lipNude-lipStrong)/lipCount>2,'lip colour is still indistinguishable from the previous subtle nude');assert((eyeNude-eyeStrong)/eyeCount>.5,'eyelid tint did not gain definition');assert(cheekGain/cheekCount>1,'cheek colour did not become visible');
     samples.push({width,skinLift:skinLift/skinCount,glossGain,lashPixels:lashGain,lipChromaGain:(lipNude-lipStrong)/lipCount,eyeChromaGain:(eyeNude-eyeStrong)/eyeCount,cheekChromaGain:cheekGain/cheekCount});
    }
    return {samples,nativeGeometryAndAlphaExact:true,naturalRestorationExact:true};
   });

   await test('v5 smooths forehead mask seams and reduces broad highlight imbalance while defining both eyes',async()=>{
    const {renderLocalMakeup}=await import('/src/local-makeup.js'),samples=[];
    for(const width of [384,900]){
     const f=source(width),W=width,H=f.original.height,ctx=f.original.getContext('2d'),frame=ctx.getImageData(0,0,W,H);
     for(let y=Math.round(H*.16);y<Math.round(H*.31);y++)for(let x=Math.round(W*.30);x<Math.round(W*.70);x++){
      const j=(y*W+x)*4,patch=28*Math.exp(-2*(((x/W-.55)/.11)**2+((y/H-.225)/.055)**2));
      for(let c=0;c<3;c++)frame.data[j+c]+=patch;
     }
     ctx.putImageData(frame,0,0);const sx=f.skinMask.getContext('2d');sx.clearRect(Math.round(W*.405),Math.round(H*.185),Math.round(W*.025),Math.round(H*.085));
     const before=read(f.original),old=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v4',cosmeticsOnly:true})),after=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v5',cosmeticsOnly:true}));
     let oldSeam=0,newSeam=0,highlightOld=0,highlightNew=0,backgroundOld=0,backgroundNew=0,hiCount=0,bgCount=0,linerGain=0,lashGain=0,eyeGain=0,eyeCount=0;
     for(let y=0;y<H;y++)for(let x=1;x<W;x++){
      const i=(y*W+x)*4,px=x/W,py=y/H,Y=p=>(p[i]+p[i+1]+p[i+2])/3;
      assert(after[i+3]===before[i+3],'v5 altered alpha');
      if(py>.20&&py<.25&&px>.39&&px<.45){const delta=p=>((p[i]+p[i+1]+p[i+2]-before[i]-before[i+1]-before[i+2])-(p[i-4]+p[i-3]+p[i-2]-before[i-4]-before[i-3]-before[i-2]))/3;oldSeam=Math.max(oldSeam,Math.abs(delta(old)));newSeam=Math.max(newSeam,Math.abs(delta(after)));}
      if(Math.abs(px-.55)<.018&&Math.abs(py-.225)<.012){highlightOld+=Y(old);highlightNew+=Y(after);hiCount++;}
      if(Math.abs(px-.35)<.018&&Math.abs(py-.225)<.012){backgroundOld+=Y(old);backgroundNew+=Y(after);bgCount++;}
      if((Math.abs(px-.36)<.05||Math.abs(px-.64)<.05)&&py>.378&&py<.399&&Y(after)<Y(old)-3)linerGain++;
      if((Math.abs(px-.36)<.07||Math.abs(px-.64)<.07)&&py>.35&&py<.378&&Y(after)<Y(old)-2)lashGain++;
      if((Math.abs(px-.36)<.04||Math.abs(px-.64)<.04)&&py>.355&&py<.378){eyeGain+=after[i]-after[i+1]-old[i]+old[i+1];eyeCount++;}
      if((Math.abs(px-.36)<.02||Math.abs(px-.64)<.02)&&Math.abs(py-.41)<.006)for(let c=0;c<3;c++)assert(after[i+c]===before[i+c],'v5 repainted the eye interior');
     }
     const oldGap=highlightOld/hiCount-backgroundOld/bgCount,newGap=highlightNew/hiCount-backgroundNew/bgCount;
     assert(newSeam<oldSeam*.65,'forehead illumination still has a hard mask step '+JSON.stringify({oldSeam,newSeam}));
     assert(newGap<oldGap-2,'forehead highlight variation did not improve '+JSON.stringify({oldGap,newGap}));
     assert(linerGain>5&&lashGain>5&&eyeGain/eyeCount>.5,'eye definition did not visibly increase '+JSON.stringify({linerGain,lashGain,eyeGain:eyeGain/eyeCount}));
     samples.push({width,oldSeam,newSeam,oldGap,newGap,linerPixels:linerGain,lashPixels:lashGain,eyeshadowChromaGain:eyeGain/eyeCount});
    }
    return {samples,eyeInteriorsExact:true,nativeGeometryAndAlphaExact:true};
   });

   await test('v6 sweeps shadow across both upper lids instead of concentrating a spot in the centre',async()=>{
    const {renderLocalMakeup}=await import('/src/local-makeup.js'),samples=[];
    for(const width of [384,900]){
     const f=source(width),W=width,H=f.original.height,before=read(f.original),v5=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v5',cosmeticsOnly:true})),v6=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v6',cosmeticsOnly:true}));
     const l=f.face[33],r=f.face[263],d=Math.hypot((r.x-l.x)*W,(r.y-l.y)*H),shade=(pixels,side,t)=>{
      const pts=C.upperLids[side].map(i=>({x:f.face[i].x*W,y:f.face[i].y*H})),at=t*(pts.length-1),j=Math.min(pts.length-2,Math.floor(at)),q=at-j,p={x:pts[j].x*(1-q)+pts[j+1].x*q,y:pts[j].y*(1-q)+pts[j+1].y*q};
      p.y-=d*(.004+.008+.052*Math.sin(Math.PI*t))/2;let sum=0,n=0;
      for(let y=Math.round(p.y)-1;y<=Math.round(p.y)+1;y++)for(let x=Math.round(p.x)-1;x<=Math.round(p.x)+1;x++){const k=(y*W+x)*4;sum+=pixels[k]-pixels[k+1]-before[k]+before[k+1];n++;}return sum/n;
     };
     for(const side of [0,1]){
      const old=[.2,.5,.8].map(t=>shade(v5,side,t)),next=[.2,.5,.8].map(t=>shade(v6,side,t));
      const oldPeak=old[1]-(old[0]+old[2])/2,newPeak=next[1]-(next[0]+next[2])/2;
      assert(newPeak<oldPeak*.7,'shadow still forms a central spot '+JSON.stringify({old,next,oldPeak,newPeak}));
      assert(Math.min(next[0],next[2])>Math.min(old[0],old[2])+1,'inner/outer lid coverage did not improve '+JSON.stringify({old,next}));
      samples.push({width,side,old,next});
     }
     for(let i=0;i<before.length;i+=4)assert(v6[i+3]===before[i+3],'v6 alpha changed');
    }
    return {samples};
   });

   await test('v7 soft rose fades upward with luminous lid centres and smooth skin on light and dark complexions',async()=>{
    const {renderLocalMakeup}=await import('/src/local-makeup.js'),samples=[];
    for(const [width,tone]of [[384,[184,141,123]],[900,[108,77,63]]]){
     const f=source(width,tone),W=width,H=f.original.height,before=read(f.original),old=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v6',cosmeticsOnly:true})),next=read(await renderLocalMakeup({...f,lookId:'shared-pink-nude-gloss-v7',cosmeticsOnly:true}));
     const d=Math.hypot((f.face[263].x-f.face[33].x)*W,(f.face[263].y-f.face[33].y)*H);
     const point=(side,u,rise)=>{
      const pts=C.upperLids[side].map(id=>({x:f.face[id].x*W,y:f.face[id].y*H})),index=u*(pts.length-1),k=Math.min(pts.length-2,Math.floor(index)),t=index-k;
      return {x:pts[k].x*(1-t)+pts[k+1].x*t,y:pts[k].y*(1-t)+pts[k+1].y*t-rise*d};
     };
     const sample=(pixels,p)=>{let red=0,light=0,n=0;for(let y=Math.round(p.y)-1;y<=Math.round(p.y)+1;y++)for(let x=Math.round(p.x)-1;x<=Math.round(p.x)+1;x++){const i=(y*W+x)*4;red+=pixels[i]-pixels[i+1]-before[i]+before[i+1];light+=(pixels[i]+pixels[i+1]+pixels[i+2]-before[i]-before[i+1]-before[i+2])/3;n++}return {rose:red/n,light:light/n}};
     for(const side of [0,1]){
      const at=[.22,.5,.78].map(u=>sample(next,point(side,u,.035))),oldCenter=sample(old,point(side,.5,.035)),upper=sample(next,point(side,.22,.13));
      assert(at[1].light>oldCenter.light+2,'centre of lid does not reflect soft light '+JSON.stringify({width,side,at,oldCenter}));
      assert(at[1].rose<Math.min(at[0].rose,at[2].rose),'rose pigment still piles up at the centre '+JSON.stringify(at));
      assert(Math.min(at[0].rose,at[2].rose)>1,'inner/outer soft rose missing '+JSON.stringify(at));
      assert(upper.rose<at[0].rose*.6,'colour does not fade toward the socket '+JSON.stringify({at,upper}));
      samples.push({width,side,lid:at,oldCenter,upper});
     }
     for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4;assert(next[i+3]===before[i+3],'v7 alpha changed');
      const inFace=(((x+.5)/W-.5)/.33)**2+(((y+.5)/H-.48)/.40)**2<1;
      if(!inFace)for(let c=0;c<4;c++)assert(next[i+c]===before[i+c],'v7 hair/background/silhouette changed');
      if((Math.abs(x/W-.36)<.02||Math.abs(x/W-.64)<.02)&&Math.abs(y/H-.41)<.006)for(let c=0;c<3;c++)assert(next[i+c]===before[i+c],'v7 eye interior changed');
     }
    }
    return {samples,geometryAlphaAndEyeInteriorsExact:true};
   });
   return {passed:reports.length,reports,providerCalls:0};
  }''')
  assert not errors,errors;assert not network,network;browser.close()
  (OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
finally:server.shutdown();server.server_close()
