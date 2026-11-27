"""Real face models and actual production measurement function; no AI generation.
Start Vite on 5223 and the female-production-lab-server fixture on 5222.
"""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('REFERENCE_BASE','http://127.0.0.1:5223')
API=os.environ.get('REFERENCE_API','http://127.0.0.1:5222')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page()
 def proxy(route):
  path=route.request.url.split('/api/',1)[1];r=route.fetch(url=API+'/api/'+path);route.fulfill(response=r)
 p.route('**/api/female-production-lab/**',proxy)
 p.goto(BASE+'/female-production-lab.html')
 result=p.evaluate('''async()=>{
 const {measureFemaleReference}=await import('/female-reference-evidence-client.js');
 const {prepareEvidence}=await import('/female-production-lab-guide.js');
 const {measureThaiAdaptiveFace}=await import('/thai-adaptive-proportion.js');
 const source=(await import('/src/main.jsx?raw')).default,start=source.indexOf('async function replacementFaceIdentityBox('),end=source.indexOf('const englishHairPlacementCache',start);
 const env={measureFemaleReference,measureThaiAdaptiveFace,decodedPortraitImage:()=>{throw Error('Production must use shared dimensions')},portraitFaceLandmarks:()=>{throw Error('Production must use shared detection')}};
 const main=Function('env','with(env){'+source.slice(start,end)+';return replacementFaceIdentityBox}')(env);
 const im=new Image();im.src='/assets/home-previews/easy-original-v20261031.webp';await im.decode();
 const outfit=await(await fetch('/assets/job-uniforms/female-job-navy-notch-white-shirt.png')).blob(),results=[];
 const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
 for(const [width,height] of [[480,640],[1536,2048]]){
  const c=Object.assign(document.createElement('canvas'),{width,height});c.getContext('2d').drawImage(im,0,0,width,height);
  const blob=await new Promise(r=>c.toBlob(r));
  const first=new File([blob],'main.png',{type:'image/png'}),second=new File([blob],'lab.png',{type:'image/png'});
  const a=(await main(first,{returnEvidence:true,includeFemalePreparation:true})).femalePreplacedFace,b=await prepareEvidence(second);
  if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Evidence differs between production and lab');
  const guide=async(person,evidence)=>{const data=new FormData();data.set('person',person);data.set('outfit',outfit,'outfit.png');data.set('femalePreplacedFace',JSON.stringify(evidence));const r=await fetch('/api/female-production-lab/guide',{method:'POST',body:data});if(!r.ok)throw Error('Guide failed');return r.blob()};
  if(await hash(await guide(first,a))!==await hash(await guide(second,b)))throw Error('Prepared image bytes differ');
  results.push({width,height,landmarkDriftPx:0,preparedGuideIdentical:true});
 }
 return results;
 }''')
 print(json.dumps(result),flush=True);b.close()
