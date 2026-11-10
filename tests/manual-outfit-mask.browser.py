import json,os
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page();p.goto(base+'/scripts/fixtures/english-portrait-flow.html?lang=en&fresh',wait_until='domcontentloaded')
 result=p.evaluate('''async()=>{
 const {default:raw}=await import('/src/main.jsx?raw');
 const {loadVisionRuntime}=await import('/src/vision-runtime.js');
 const {VISION_WASM_ROOT,FACE_LANDMARK_MODEL,PERSON_SEGMENTATION_MODEL}=await import('/src/vision-assets.js');
 const {FilesetResolver,FaceLandmarker,ImageSegmenter}=await loadVisionRuntime();
 const resolver=await FilesetResolver.forVisionTasks(VISION_WASM_ROOT);
 const landmarker=await FaceLandmarker.createFromOptions(resolver,{baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1});
 const segmenter=await ImageSegmenter.createFromOptions(resolver,{baseOptions:{modelAssetPath:PERSON_SEGMENTATION_MODEL},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
 const canvasFor=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
 const loadImage=async src=>{if(typeof src!=='string')throw Error('Canvas was passed to the URL loader');const im=new Image();im.src=src;await im.decode();return im};
 const decodedPortraitImage=async blob=>{const url=URL.createObjectURL(blob);try{return await loadImage(url)}finally{URL.revokeObjectURL(url)}};
 const {decodedStudioImage}=await import('/src/studio-image-cache.js');
 const env={canvasFor,loadImage,decodedStudioImage,decodedPortraitImage,canvasPng:c=>new Promise(r=>c.toBlob(r)),getPersonSegmenter:async()=>segmenter,portraitFaceLandmarks:async(blob,image)=>landmarker.detect(image||await decodedPortraitImage(blob)).faceLandmarks[0],v192MasterMaskCache:new WeakMap(),...(await import('/src/portrait-hair-protection.js')),...(await import('/src/portrait-neck-boundary.js')),...(await import('/src/replace-studio-source.js')),...(await import('/src/manual-outfit-mask.js')),...(await import('/src/shared-studio-skin.js')),...(await import('/original-portrait-ai.js'))};
 for(const name of ['getV192MasterMasks','protectNativePortraitHair','cleanPortraitClothing','prepareEnglishManualPortraitMask']){const a=raw.indexOf('async function '+name+'('),z=raw.indexOf('\\n}',a)+2;env[name]=Function('env','with(env){'+raw.slice(a,z)+';return '+name+'}')(env)}
 const sheet=await loadImage('/assets/english-examples/professional-portraits-v1.webp'),w=Math.floor(sheet.width/3),h=Math.floor(sheet.height/2),portrait=canvasFor(w,h),x=portrait.getContext('2d');x.drawImage(sheet,0,0,w,h,0,0,w,h);
 const source=portrait.toDataURL(),previous=canvasFor(w,h);previous.getContext('2d').fillStyle='white';previous.getContext('2d').fillRect(0,0,w,h);const head={source:portrait,mask:previous,studioSkinVersion:env.ORIGINAL_PORTRAIT_AI_VERSION};
 const face=landmarker.detect(portrait).faceLandmarks[0];if(!face)throw Error('Test portrait has no face');
 const mask=await env.prepareEnglishManualPortraitMask(head),original=x.getImageData(0,0,w,h).data;
 const out=canvasFor(w,h),ox=out.getContext('2d');ox.drawImage(portrait,0,0);ox.globalCompositeOperation='destination-in';ox.drawImage(await loadImage(mask),0,0,w,h);const after=ox.getImageData(0,0,w,h).data;
 let removed=0;for(let i=3;i<original.length;i+=4)if(original[i]>200&&after[i]<16)removed++;
 if(removed<1000)throw Error('Old clothing was not removed');
 const cy=Math.floor((face[10].y+face[152].y)/2*h),cx=Math.floor((face[234].x+face[454].x)/2*w),n=(cy*w+cx)*4;
 if(original[n+3]!==after[n+3])throw Error('Face alpha changed');
 if(head.source!==portrait||portrait.toDataURL()!==source)throw Error('Full AI portrait was replaced');
 landmarker.close();segmenter.close();return {removedPixels:removed,faceRetained:true,originalAiImageRetained:true,historyCanvasSourceAndMaskAccepted:true};
 }''')
 print(json.dumps(result));b.close()
