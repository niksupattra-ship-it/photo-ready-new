"""Real MediaPipe models on existing public portraits, with no AI/account calls.
Official model downloads use the inherited HTTP proxy and trusted CA; runtime
WASM is the unchanged installed @mediapipe/tasks-vision1.0.1 package. Browser
routing supplies those exact bytes, never mocked landmarks or semantic labels.
"""
import base64,hashlib,json,mimetypes,os,pathlib,urllib.request
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('STUDIO_SKIN_BASE','http://127.0.0.1:5174')
OUT=pathlib.Path(os.environ.get('STUDIO_SKIN_OUTPUT','/workspace/output/staged-skin-20261107/real-evidence'));OUT.mkdir(parents=True,exist_ok=True)
MODEL_ROOT='https://storage.googleapis.com/mediapipe-models/'
FACE=MODEL_ROOT+'face_landmarker/face_landmarker/float16/1/face_landmarker.task'
SEGMENT=MODEL_ROOT+'image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'
WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/'
PACKAGE=ROOT/'node_modules/@mediapipe/tasks-vision'
assert json.loads((PACKAGE/'package.json').read_text())['version']=='1.0.1'
provenance=[];models={}
for url in [FACE,SEGMENT]:
 name=url.rsplit('/',1)[1];path=OUT/name
 if not path.exists():
  with urllib.request.urlopen(url,timeout=45)as r:data=r.read()
  path.write_bytes(data)
 else:data=path.read_bytes()
 assert len(data)>10000
 models[url]=data;provenance.append({'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'source':'official model download'})
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':900});page.set_default_timeout(120000)
 errors=[];api=[];unexpected=[];telemetry_blocked=[];served=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  url=r.request.url
  if '/api/'in url:api.append(url);r.abort();return
  if url.startswith('https://odml.pa.googleapis.com/v1/log'):telemetry_blocked.append(url);r.abort();return
  if url in models:
   served.append(url);r.fulfill(status=200,content_type='application/octet-stream',body=models[url]);return
  if url.startswith(WASM):
   name=url.rsplit('/',1)[1];path=PACKAGE/'wasm'/name
   assert path.is_file() and path.parent==(PACKAGE/'wasm'),url
   data=path.read_bytes();served.append(url)
   provenance.append({'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'source':'unchanged official installed package1.0.1'})
   r.fulfill(status=200,content_type='application/wasm'if name.endswith('.wasm')else'application/javascript',body=data);return
  if url==BASE+'/tests/studio-skin-real-evidence.html':r.fulfill(status=200,content_type='text/html',body='<html><body>Real skin evidence smoke</body></html>');return
  if url.startswith(BASE+'/'):r.continue_();return
  unexpected.append(url);r.abort()
 page.route('**/*',route);page.goto(BASE+'/tests/studio-skin-real-evidence.html')
 page.evaluate('''async({faceUrl,segmentUrl,wasm})=>{
  const {loadVisionRuntime}=await import('/src/vision-runtime.js');
  const {FaceLandmarker,ImageSegmenter,FilesetResolver}=await loadVisionRuntime();
  const files=await FilesetResolver.forVisionTasks(wasm);
  window.realSkinLandmarker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:faceUrl},runningMode:'IMAGE',numFaces:1});
  window.realSkinSegmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:segmentUrl},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
  window.realSkinMaskDimensions=[];window.measuredSkinSegmenter={segment(image,callback){realSkinSegmenter.segment(image,result=>{realSkinMaskDimensions.push([result.categoryMask.width,result.categoryMask.height]);callback(result)})}};
 }''',{'faceUrl':FACE,'segmentUrl':SEGMENT,'wasm':WASM})
 results=[]
 for index,source in enumerate(['/assets/face-finish/natural.webp','/assets/job-uniforms/female-suit-04-v2-example.webp'],1):
  result=page.evaluate('''async(source)=>{
   const {captureStudioSkinEvidence}=await import('/src/studio-skin-evidence.js');
   const {applyStudioSkinBase,parseStudioSkinEvidence}=await import('/studio-skin-treatment.js');
   const blob=await(await fetch(source)).blob();
   const decode=async b=>{const url=URL.createObjectURL(b),im=new Image();try{im.src=url;await im.decode();return im}finally{URL.revokeObjectURL(url)}};
   const signal={get aborted(){return false}};
   const evidence=await captureStudioSkinEvidence(blob,{decode,landmarker:realSkinLandmarker,segmenter:measuredSkinSegmenter,signal});
   parseStudioSkinEvidence(JSON.stringify(evidence));
   const image=await decode(blob),W=image.naturalWidth,H=image.naturalHeight,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);const original=x.getImageData(0,0,W,H),copy=new Uint8ClampedArray(original.data);
   const result=applyStudioSkinBase({pixels:original.data,width:W,height:H,evidence});
   let outsideMismatch=0,alphaMismatch=0,inputMismatch=0,protectedMismatch=0,skin=0,totalDelta=0;
   for(let i=0;i<W*H;i++){const y=Math.floor(i/W),px=i%W,k=i*4,label=evidence.labels[Math.floor(y*evidence.maskHeight/H)*evidence.maskWidth+Math.floor(px*evidence.maskWidth/W)];if(label===2||label===3)skin++;for(let ch=0;ch<4;ch++){if(original.data[k+ch]!==copy[k+ch])inputMismatch++;if(label!==2&&label!==3&&result.pixels[k+ch]!==copy[k+ch])outsideMismatch++;if(ch<3)totalDelta+=Math.abs(result.pixels[k+ch]-copy[k+ch])}if(result.pixels[k+3]!==copy[k+3])alphaMismatch++}
   for(const id of [33,263,70,300,61,291,98,327]){const p=evidence.face[id],k=(Math.min(H-1,Math.max(0,Math.floor(p[1]*H)))*W+Math.min(W-1,Math.max(0,Math.floor(p[0]*W))))*4;for(let ch=0;ch<4;ch++)if(result.pixels[k+ch]!==copy[k+ch])protectedMismatch++}
   const before=c.toDataURL('image/png');x.putImageData(new ImageData(new Uint8ClampedArray(result.pixels),W,H),0,0);const after=c.toDataURL('image/png');
   let cancellation=false;try{await captureStudioSkinEvidence(blob,{decode,landmarker:realSkinLandmarker,segmenter:measuredSkinSegmenter,signal:{get aborted(){return true}}})}catch(e){cancellation=e.name==='AbortError'}
   return {source,width:W,height:H,faceLandmarks:evidence.face.length,mask:[evidence.maskWidth,evidence.maskHeight],realModelMask:realSkinMaskDimensions.at(-1),semanticSkinPixels:skin,uniqueLabels:[...new Set(evidence.labels)],evidenceBytes:JSON.stringify(evidence).length,report:result.report,outsideMismatch,alphaMismatch,inputMismatch,protectedMismatch,meanRGBDelta:totalDelta/(W*H*3),getterOnlyCancellation:cancellation,before,after};
  }''',source)
  for key in ['before','after']:(OUT/f'{index}-{key}.png').write_bytes(base64.b64decode(result.pop(key).split(',',1)[1]))
  assert result['faceLandmarks']in[468,478] and result['semanticSkinPixels']>64,result
  assert result['report'].get('reason')!='insufficient_skin_evidence',result
  assert all(result[key]==0 for key in ['outsideMismatch','alphaMismatch','inputMismatch','protectedMismatch']),result
  assert result['getterOnlyCancellation'],result
  results.append(result);print(json.dumps(result),flush=True)
 page.evaluate('()=>{realSkinLandmarker.close();realSkinSegmenter.close()}');browser.close()
 assert not errors,errors;assert not api,api;assert not unexpected,unexpected
 assert FACE in served and SEGMENT in served,served
 proof={'passed':len(results),'realModels':True,'runtimeVersion':'1.0.1','results':results,'modelProvenance':provenance,'pageErrors':errors,'apiCalls':api,'unexpectedRequests':unexpected,'blockedLibraryTelemetry':telemetry_blocked}
 (OUT/'results.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'passed':len(results),'realModels':True,'apiCalls':0,'pageErrors':0,'blockedLibraryTelemetry':len(telemetry_blocked)}))
