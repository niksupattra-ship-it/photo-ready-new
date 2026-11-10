import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 p=b.new_page()
 p.goto(base+'/scripts/fixtures/paired-portrait-finish.html',wait_until='domcontentloaded')
 result=p.evaluate('''async()=>{
 const {loadVisionRuntime}=await import('/src/vision-runtime.js');
 const {VISION_WASM_ROOT,FACE_LANDMARK_MODEL}=await import('/src/vision-assets.js');
 const {useAiMakeupPixels,restrictPairedPortraitMakeup}=await import('/src/ai-makeup-pair.js');
 const {FilesetResolver,FaceLandmarker}=await loadVisionRuntime();
 const model=await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(VISION_WASM_ROOT),{baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1});
 const image=new Image();image.src='/assets/face-finish/natural.webp';await image.decode();
 const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const original=ctx.getImageData(0,0,c.width,c.height),source=c.toDataURL(),face=model.detect(image).faceLandmarks[0];if(!face)throw Error('no real face detected');
 const altered=new Uint8ClampedArray(original.data);
 // Simulate a misbehaving AI changing every pixel, not merely a perfect edit.
 for(let i=0;i<altered.length;i+=4)for(let ch=0;ch<3;ch++)altered[i+ch]=Math.round(altered[i+ch]*.6);
 const pixels=useAiMakeupPixels({natural:original.data,makeup:altered,width:c.width,height:c.height,face});
 let protectedPixels=0,faceChanges=0;const chin=face[152].y*c.height;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const i=(y*c.width+x)*4;
  if(y>chin){for(let ch=0;ch<4;ch++)if(pixels[i+ch]!==original.data[i+ch])throw Error('body changed');protectedPixels++}
  else if(pixels[i]!==original.data[i])faceChanges++;
  if(pixels[i+3]!==original.data[i+3])throw Error('alpha changed');
 }
 if(!protectedPixels||!faceChanges)throw Error('regions not exercised');
 ctx.putImageData(new ImageData(altered,c.width,c.height),0,0);const raw=c.toDataURL();
 let measurements=0;const measureFace=async img=>{measurements++;return model.detect(img).faceLandmarks[0]};
 const head={studioSkinBaseSource:source,aiMakeupSource:raw};
 const fixed=await restrictPairedPortraitMakeup(head,{measureFace});
 const again=await restrictPairedPortraitMakeup(fixed,{measureFace});
 if(measurements!==1||again.aiMakeupSource!==fixed.aiMakeupSource)throw Error('repeated switches not cached');
 const fixedImage=new Image();fixedImage.src=fixed.aiMakeupSource;await fixedImage.decode();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(fixedImage,0,0);
 const saved=ctx.getImageData(0,0,c.width,c.height).data;
 for(let y=Math.ceil(chin)+1;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;for(let ch=0;ch<4;ch++)if(saved[i+ch]!==original.data[i+ch])throw Error('saved body changed')}
 model.close();return {protectedPixels,faceChanges,measurements,storedPairBodyUnchanged:true};
}''')
 print(json.dumps(result));b.close()
