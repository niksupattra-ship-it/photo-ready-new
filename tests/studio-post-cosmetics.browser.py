"""Actual native-pixel post-cosmetics renderer and resume-safe Blob wrapper.
No providers, account APIs, images from users, or external network requests.
"""
import contextlib,http.server,json,os,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=pathlib.Path(os.environ.get('STUDIO_COSMETICS_OUTPUT','/tmp/studio-post-cosmetics'));OUT.mkdir(parents=True,exist_ok=True)
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start();base='http://127.0.0.1:'+str(server.server_port)
try:
 with sync_playwright()as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page();errors=[];network=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if not r.request.url.startswith(base+'/')or'/api/'in r.request.url:network.append(r.request.url);r.abort();return
   if r.request.url.endswith('/__baseline-local-makeup.js'):
    p=os.environ.get('COSMETICS_BASELINE_FILE');assert p;r.fulfill(status=200,content_type='text/javascript',body=pathlib.Path(p).read_text());return
   if r.request.url==base+'/':r.fulfill(status=200,content_type='text/html',body='<!doctype html><title>Post cosmetics pixel checks</title>');return
   r.continue_()
  page.route('**/*',route);page.goto(base+'/')
  results=page.evaluate(r'''async({baseline})=>{
   const {renderLocalMakeup,LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
   const {finishStudioPostCosmetics}=await import('/src/studio-post-cosmetics.js');
   const {STUDIO_SKIN_WORKFLOW_VERSION:VERSION}=await import('/studio-skin-treatment.js');
   const assert=(v,m)=>{if(!v)throw Error(m)},reports=[];
   const test=async(name,run)=>{const detail=await run();reports.push({name,...detail})};
   const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
   const read=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
   const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
   const png=c=>new Promise((ok,bad)=>c.toBlob(b=>b?ok(b):bad(Error('PNG encode failed')),'image/png'));
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
   for(const[width,tone]of[[384,[184,141,123]],[900,[108,77,63]]])await test('native skin, lower-eye colour and alpha remain exact at '+width,async()=>{
    const f=source(width,tone),before=read(f.original).slice(),out=await renderLocalMakeup({...f,lookId:'local-korean-pink-eye-v1',cosmeticsOnly:true}),after=read(out);let changed=0,protectedCount=0,lipChanged=0,upperChanged=0;
    const W=out.width,H=out.height;assert(W===f.original.width&&H===f.original.height,'native dimensions changed');
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
     const k=(y*W+x)*4,px=(x+.5)/W,py=(y+.5)/H;assert(after[k+3]===before[k+3],'alpha changed');
     const lip=px>.395&&px<.605&&py>.645&&py<.715,upper=(px>.275&&px<.725&&py>.35&&py<.415);
     const differs=[0,1,2].some(c=>after[k+c]!==before[k+c]);
     if(differs){changed++;assert(lip||upper,'cosmetics escaped lips/upper lids at '+px+','+py);if(lip)lipChanged++;if(upper)upperChanged++}
     if(!lip&&!upper){protectedCount++;for(let c=0;c<4;c++)assert(after[k+c]===before[k+c],'skin/detail changed')}
     if(py>.435&&py<.51)for(let c=0;c<4;c++)assert(after[k+c]===before[k+c],'under-eye colour changed');
    }
    assert(changed>50&&lipChanged>20&&upperChanged>10,'selected cosmetics were not visible');assert(equal(read(f.original),before),'input was mutated');
    return {width:W,height:H,changedPixels:changed,protectedPixels:protectedCount,lipPixels:lipChanged,upperLidPixels:upperChanged};
   });
   for(const lookId of ['local-natural-pink-v1','local-pink-glow-v1','local-korean-pink-eye-v1'])await test('backward-compatible default '+lookId,async()=>{
    const f=source(),implicit=read(await renderLocalMakeup({...f,lookId})),explicit=read(await renderLocalMakeup({...f,lookId,cosmeticsOnly:false}));assert(equal(implicit,explicit),'new option changed default output');
    if(baseline){const old=await import('/__baseline-local-makeup.js'),before=read(await old.renderLocalMakeup({...f,lookId}));assert(equal(before,implicit),'legacy output differs from baseline')}
    return {matchesImplicitDefault:true,matchesOriginalBaseline:baseline};
   });
   await test('natural does not decode, segment, draw or encode',async()=>{
    const input=new Blob(['unchanged source'],{type:'image/png'});let calls=0;
    assert(await finishStudioPostCosmetics(input,{style:'natural',prepare(){calls++},toBlob(){calls++}})===input,'natural replaced blob');assert(calls===0,'natural ran cosmetic preparation');return {preparationCalls:calls};
   });
   for(const style of ['makeup','korean-rosy-v1','soft-rosy-v1'])await test('final '+style+' is explicit, idempotent and metadata-safe',async()=>{
    const f=source(),input=await png(f.original),originalBytes=new Uint8Array(await input.arrayBuffer());input.idpromStudioSkinVersion=VERSION;input.idpromJobId='fixture';input.idpromTrial=true;input.idpromFemaleEyeStyle=style;let prepares=0,encodes=0;
    const options={style,prepare:async()=>{prepares++;return f},toBlob:async c=>{encodes++;return png(c)}};
    const result=await finishStudioPostCosmetics(input,options);assert(result!==input,'makeup produced no result');assert(result.idpromJobId==='fixture'&&result.idpromTrial===true&&result.idpromFemaleEyeStyle===style,'identity/style/rights metadata drift');assert(result.idpromStudioSkinVersion===VERSION&&result.idpromStudioCosmeticsVersion===VERSION+':'+style,'version marker missing');
    assert(await finishStudioPostCosmetics(result,options)===result,'applied cosmetics twice');assert(prepares===1&&encodes===1,'second call did work');assert(equal(originalBytes,new Uint8Array(await input.arrayBuffer())),'source Blob was mutated');assert(!input.idpromStudioCosmeticsVersion,'source got finished marker');return {preparations:prepares,encodes};
   });
   await test('missing staged base and interrupted postprocess fail before delivery',async()=>{
    const input=await png(source().original);let calls=0;
    try{await finishStudioPostCosmetics(input,{style:'makeup',prepare(){calls++}});throw Error('accepted missing base')}catch(e){assert(e.message!=='accepted missing base','accepted missing base')};assert(calls===0,'legacy image got post cosmetics');input.idpromStudioSkinVersion=VERSION;let cancelled=false;
    try{await finishStudioPostCosmetics(input,{style:'makeup',signal:{get aborted(){return cancelled}},prepare:async()=>{cancelled=true;return source()},toBlob:async()=>{calls++;return input}});throw Error('ignored cancellation')}catch(e){assert(e.name==='AbortError','wrong cancellation result')};assert(calls===0&&!input.idpromStudioCosmeticsVersion,'cancelled stage committed');return {noLegacyCosmetics:true,noCancelledCommit:true};
   });
   return {passed:reports.length,reports,providerCalls:0};
  }''',{'baseline':bool(os.environ.get('COSMETICS_BASELINE_FILE'))})
  assert not errors,errors;assert not network,network;browser.close()
  (OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
finally:server.shutdown();server.server_close()
