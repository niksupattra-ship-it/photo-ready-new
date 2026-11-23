"""Offline real-model regression on saved AI QA PNGs. No account/provider calls.
Set THAI_NATIVE_INPUT_ROOT and THAI_NATIVE_OUTPUT to supply fixtures/output.
"""
import base64,json,pathlib,os
from playwright.sync_api import sync_playwright
samples=['live-natural-result.png','live-makeup-result.png','english-neck-qa/v6b-ivory-natural.png','english-neck-qa/v6b-male-natural.png','english-neck-qa/v6b-navy-natural.png','english-neck-qa/v6b-navy-makeup.png']
root=pathlib.Path(os.environ.get('THAI_NATIVE_INPUT_ROOT','/workspace/work'));out=pathlib.Path(os.environ.get('THAI_NATIVE_OUTPUT','/tmp/thai-native-fit-browser'));out.mkdir(parents=True,exist_ok=True)
assert all((root/name).exists() for name in samples), 'Saved AI QA fixtures are required'
requests=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page();page.on('request',lambda r:requests.append(r.url));page.route('**/head-ratio-audit.html',lambda r:r.fulfill(content_type='text/html',body='<html><body>Local geometry audit</body></html>'));page.goto('http://127.0.0.1:5204/head-ratio-audit.html')
 page.evaluate('''async()=>{const {loadVisionRuntime}=await import('/src/vision-runtime.js');const {FaceLandmarker,ImageSegmenter,FilesetResolver}=await loadVisionRuntime();const a=await import('/src/vision-assets.js');const v=await FilesetResolver.forVisionTasks(a.VISION_WASM_ROOT);window.lm=await FaceLandmarker.createFromOptions(v,{baseOptions:{modelAssetPath:a.FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1});window.sg=await ImageSegmenter.createFromOptions(v,{baseOptions:{modelAssetPath:a.PERSON_SEGMENTATION_MODEL},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});}''')
 results=[]
 for name in samples:
  path=root/name
  if not path.exists():continue
  data={'name':name,'base64':base64.b64encode(path.read_bytes()).decode(),'template':'/assets/government-uniforms/'+('male-government-employee.png' if 'male' in name else 'female-operational.png')}
  result=page.evaluate('''async({name,base64,template})=>{
   const {thaiBodyGeometry}=await import('/src/thai-body-geometry.js');const {fitEnglishHeadTemplate}=await import('/english-head-portrait.js');const {measureUniformAnchors}=await import('/src/portrait-uniform-fit.js');
   const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob());const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);const face=lm.detect(c).faceLandmarks?.[0];if(!face)return {name,unmeasurable:'no face'};
   const w=image.width,h=image.height,pixels=x.getImageData(0,0,w,h).data;let labels;sg.segment(c,r=>{labels={width:r.categoryMask.width,height:r.categoryMask.height,data:new Uint8Array(r.categoryMask.getAsUint8Array())}});
   const hair=new Uint8ClampedArray(w*h*4),clothing=new Uint8ClampedArray(w*h*4);let crown=h;
   for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const cat=labels.data[Math.min(labels.height-1,Math.floor(y*labels.height/h))*labels.width+Math.min(labels.width-1,Math.floor(xx*labels.width/w))],i=(y*w+xx)*4+3;if(cat===1){hair[i]=255;crown=Math.min(crown,y)}if(cat===4)clothing[i]=255}
   const generated=thaiBodyGeometry({pixels,hair,clothing,width:w,height:h,face});
   const {createThaiNativeHeadFit}=await import('/src/thai-native-head-fit.js');
   const canvasFor=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
   const toBlob=c=>new Promise(r=>c.toBlob(r,'image/png'));
   const prepare=createThaiNativeHeadFit({decode:async blob=>createImageBitmap(blob),faceLandmarks:async(_b,im)=>{const cc=canvasFor(im.width,im.height);cc.getContext('2d').drawImage(im,0,0);return lm.detect(cc).faceLandmarks?.[0]},segment:async im=>{let lab;sg.segment(im,r=>{lab={width:r.categoryMask.width,height:r.categoryMask.height,data:new Uint8Array(r.categoryMask.getAsUint8Array())}});return lab},loadImage:async path=>createImageBitmap(await(await fetch(path)).blob()),canvasFor,toBlob,copyMetadata:(_a,b)=>b});
   const source=await(await fetch('data:image/png;base64,'+base64)).blob(),corrected=await prepare(source,template);
   const correction={fittedFaceRatio:corrected.idpromThaiNativeFitGeometry?.faceRatio,applied:corrected!==source,version:corrected.idpromThaiNativeHeadFitVersion||null,review:!!corrected.idpromQualityReviewNeeded};
   if(corrected!==source){const ci=await createImageBitmap(corrected),cf=canvasFor(ci.width,ci.height),cfctx=cf.getContext('2d');cfctx.drawImage(ci,0,0);const mapped=lm.detect(cf).faceLandmarks?.[0];if(mapped){const a=face[234],b=face[454],ma=mapped[234],mb=mapped[454];correction.eyeToChinDelta=Math.abs((mapped[152].y-(mapped[33].y+mapped[263].y)/2)/(face[152].y-(face[33].y+face[263].y)/2)/Math.abs((mb.x-ma.x)/(b.x-a.x))-1)}
    const geom=corrected.idpromThaiNativeFitGeometry,ref=canvasFor(ci.width,ci.height),rx=ref.getContext('2d',{willReadFrequently:true});rx.imageSmoothingEnabled=true;rx.imageSmoothingQuality='high';rx.drawImage(image,geom.head.x,geom.head.y,geom.head.w,geom.head.h);const expected=rx.getImageData(0,0,ci.width,ci.height).data,actual=cfctx.getImageData(0,0,ci.width,ci.height).data;let changed=0,checked=0;const xl=Math.ceil(geom.head.x+face[234].x*image.width*geom.scale+8),xr=Math.floor(geom.head.x+face[454].x*image.width*geom.scale-8),yt=Math.ceil(geom.head.y+face[10].y*image.height*geom.scale+4);for(let yy=yt;yy<Math.floor(geom.chinY)-4;yy++)for(let xx=xl;xx<xr;xx++){const i=(yy*ci.width+xx)*4;if(expected[i+3]<250)continue;checked++;if([0,1,2].some(k=>Math.abs(expected[i+k]-actual[i+k])>1))changed++;}correction.facePixelsChecked=checked;correction.facePixelsChanged=changed;if(changed)throw Error('Face pixels differ from uniform-only transform');
    correction.png=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(corrected)});ci.close();}

   const u=await createImageBitmap(await(await fetch(template)).blob()),uc=document.createElement('canvas');uc.width=u.width;uc.height=u.height;const ux=uc.getContext('2d',{willReadFrequently:true});ux.drawImage(u,0,0);const uniform=measureUniformAnchors(ux.getImageData(0,0,u.width,u.height).data,u.width,u.height);const fitted=fitEnglishHeadTemplate({uniform,face,width:w,height:h,crownY:crown});
   image.close();u.close();return {...correction,name,generatedFaceToShoulder:generated?.faceToShoulder,generatedWholeHeadToShoulder:generated?.wholeHeadWidthToShoulder,nativeFitFaceToShoulder:fitted.faceRatio,neckGap:fitted.collarY-fitted.chinY,uniformHeadScale:fitted.scale,aiCalls:0};
  }''',data)
  encoded=result.pop('png',None)
  if encoded:(out/(path.stem+'-fitted.png')).write_bytes(base64.b64decode(encoded))
  results.append(result);print(json.dumps(result),flush=True)
 assert len(results)==len(samples) and all(r.get('applied') and r.get('facePixelsChanged')==0 for r in results)
 assert not [url for url in requests if '/api/' in url or (url.startswith('http') and not url.startswith('http://127.0.0.1:5204/'))], 'No account/provider or external requests allowed'
 (out/'real-measurements.json').write_text(json.dumps(results,indent=2));browser.close()
