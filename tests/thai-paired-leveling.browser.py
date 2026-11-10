"""Optional Thai auto-level must never discard a completed AI image pair."""
import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page();p.goto(base+'/scripts/fixtures/paired-portrait-finish.html',wait_until='domcontentloaded')
 result=p.evaluate('''async()=>{
 const {default:raw}=await import('/src/main.jsx?raw');
 const {portraitLevelTransform}=await import('/src/portrait-level.js');
 const {copyStudioSkinBlobMetadata}=await import('/src/shared-studio-skin.js');
 const canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
 const encode=c=>new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('encode failed')),'image/png'));
 const make=async colour=>{const c=canvasFor(160,240),x=c.getContext('2d');x.fillStyle=colour;x.fillRect(45,35,70,190);return encode(c)};
 const decode=async blob=>{const image=new Image(),url=URL.createObjectURL(blob);try{image.src=url;await image.decode();return image}finally{URL.revokeObjectURL(url)}};
 const natural=await make('#bd9a87'),makeup=await make('#dfb6bb');Object.assign(natural,{idpromAiMakeupBlob:makeup,idpromJobId:'same-job'});
 const start=raw.indexOf('async function levelPortraitCutout('),end=raw.indexOf('\\n}',start)+2;
 const face=[];face[33]={x:.3,y:.3};face[263]={x:.7,y:.35};
 const results=[];
 for(const failure of ['none','landmarks','natural-encode','makeup-encode']){
  let encodes=0;
  const env={decodedPortraitImage:decode,portraitFaceLandmarks:async()=>{if(failure==='landmarks')throw Error('temporary detector failure');return face},portraitLevelTransform,canvasFor,copyStudioSkinBlobMetadata,canvasPng:async c=>{encodes++;if(failure==='natural-encode'&&encodes===1||failure==='makeup-encode'&&encodes===2)throw Error('temporary encode failure');return encode(c)}};
  const level=Function('env','with(env){'+raw.slice(start,end)+';return levelPortraitCutout}')(env);
  const output=await level(natural);
  if(failure==='none'){
   if(output===natural)throw Error('rotation not exercised');
   const a=await decode(output),b=await decode(output.idpromAiMakeupBlob);
   if(a.naturalWidth!==b.naturalWidth||a.naturalHeight!==b.naturalHeight)throw Error('pair orientation diverged');
   if(output.idpromJobId!=='same-job')throw Error('metadata lost');
  }else if(output!==natural||output.idpromAiMakeupBlob!==makeup)throw Error('optional auto-level discarded original pair');
  if(natural.idpromAiMakeupBlob!==makeup)throw Error('original pair mutated');
  results.push(failure);
 }
 return {passed:true,cases:results,noExtraAi:true,originalPairRetained:true};
}''')
 print(json.dumps(result));b.close()
