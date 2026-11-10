"""Real local MediaPipe + MODNet on repository demonstration portraits only.
Requires local Vite and Express matting; no provider/account/payment calls.
"""
import os,pathlib,base64,json
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193');matte=os.environ.get('MATTE_BASE','http://127.0.0.1:3000')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page();p.set_default_timeout(60000)
 p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else r.abort())
 samples=[]
 for name in ['female-formal-suit-example.png','female-lapel-suit-example.png','male-suit-03-example.png']:
  response=p.request.post(matte+'/api/remove-background',multipart={'image':{'name':name,'mimeType':'image/png','buffer':(root/'public/assets/job-uniforms'/name).read_bytes()}})
  assert response.ok
  samples.append({'name':name,'url':'data:image/png;base64,'+base64.b64encode(response.body()).decode()})
 p.goto(base+'/scripts/fixtures/english-home-examples.html?lang=en',wait_until='domcontentloaded')
 results=p.evaluate('''async(samples)=>{
 const {default:raw}=await import('/src/main.jsx?raw'),{loadVisionRuntime}=await import('/src/vision-runtime.js'),{withDeadline}=await import('/src/async-deadline.js'),assets=await import('/src/vision-assets.js'),{measureEnglishProportions}=await import('/src/english-proportion-check.js');
 const env={landmarkerPromise:null,loadVisionRuntime,withDeadline,...assets},a=raw.indexOf('async function getLandmarker('),z=raw.indexOf('\\n}',a)+2;
 const model=await Function('env','with(env){'+raw.slice(a,z)+';return getLandmarker}')(env)(),out=[];
 for(const sample of samples){const im=new Image();im.src=sample.url;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);const result=measureEnglishProportions(x.getImageData(0,0,c.width,c.height).data,c.width,c.height,model.detect(im).faceLandmarks?.[0]);out.push({name:sample.name,...result})}model.close();return out;
}''',samples)
 assert len(results)==3
 assert all(item['measurable'] for item in results),results
 assert results[1]['oversized'],'the former lapel example exceeds the new ten-percent-smaller target'
 assert not results[0]['oversized'] and not results[2]['oversized'],results
 print(json.dumps(results));b.close()
