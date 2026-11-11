"""Compare actual AI proportions, without modifying the delivered PNG."""
from pathlib import Path
import os,json,time,urllib.request,urllib.parse,hashlib
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:5173'
candidate=Path('/tmp/identity-natural.png').read_bytes()
report=json.loads(Path('/tmp/identity-native-report.json').read_text())
expected=report['naturalSha256']
assert hashlib.sha256(candidate).hexdigest()==expected
# Baseline is the public original subject; compare the candidate to the measured
# actual V4 QA ratio, not to another independently generated portrait.
with sync_playwright()as pw:
 b=pw.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page()
 def route(r):
  if r.request.url==BASE+'/qa-native.png':r.fulfill(body=candidate,content_type='image/png')
  elif r.request.url.startswith(BASE+'/')and'/api/'not in r.request.url:r.continue_()
  else:r.abort()
 p.route('**/*',route)
 p.goto(BASE+'/scripts/fixtures/english-download.html?lang=en',wait_until='domcontentloaded')
 result=p.evaluate("""async()=>{
 const {loadVisionRuntime}=await import('/src/vision-runtime.js'),{FilesetResolver,FaceLandmarker}=await loadVisionRuntime(),{VISION_WASM_ROOT,FACE_LANDMARK_MODEL}=await import('/src/vision-assets.js'),{measureEnglishProportions}=await import('/src/english-proportion-check.js');
 const vision=await FilesetResolver.forVisionTasks(VISION_WASM_ROOT),fm=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1}),im=new Image();im.src='/qa-native.png';await im.decode();
 const face=fm.detect(im).faceLandmarks?.[0],c=Object.assign(document.createElement('canvas'),{width:im.naturalWidth,height:im.naturalHeight}),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
 const metrics=measureEnglishProportions(x.getImageData(0,0,c.width,c.height).data,c.width,c.height,face,{allowCropped:true});
 return {width:c.width,height:c.height,metrics};}""")
 p.screenshot(path='/tmp/identity-layout-page.png')
 b.close()
result['providerCalls']=report['providerCalls'];result['nativeSha256']=expected
result['previousActualV4FaceRatio']=0.3590504490372361
print('IDENTITY_LAYOUT_MEASUREMENT '+json.dumps(result),flush=True)
assert result['metrics']['measurable']
assert .26<=result['metrics']['faceRatio']<=.325,'AI head is still outside the intended proportion range'
assert result['metrics']['faceRatio']<result['previousActualV4FaceRatio']*.93,'Actual AI head did not materially shrink'
assert result['metrics']['shoulderSpan']>=1550,'AI must not narrow the selected garment to fit the head'
