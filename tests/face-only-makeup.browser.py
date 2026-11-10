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
 const {measureMakeupNeckSkin}=await import('/src/makeup-skin-mask.js');
 const {FilesetResolver,FaceLandmarker}=await loadVisionRuntime();
 const model=await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(VISION_WASM_ROOT),{baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1});
 const image=new Image();image.src='/assets/job-uniforms/female-formal-suit-example.png';await image.decode();
 const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
 const original=ctx.getImageData(0,0,c.width,c.height),source=c.toDataURL(),face=model.detect(image).faceLandmarks[0];if(!face)throw Error('no real face detected');
 const altered=new Uint8ClampedArray(original.data);
 // Simulate a misbehaving AI changing every pixel, not merely a perfect edit.
 for(let i=0;i<altered.length;i+=4)for(let ch=0;ch<3;ch++)altered[i+ch]=Math.round(altered[i+ch]*.6);
 const neckSkin=await measureMakeupNeckSkin(image);
 const pixels=useAiMakeupPixels({natural:original.data,makeup:altered,width:c.width,height:c.height,face,neckSkin});
 let protectedPixels=0,faceChanges=0,neckChanges=0,baseLight=0,editLight=0,skinCount=0;const chin=face[152].y*c.height;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const i=(y*c.width+x)*4;
  const label=neckSkin.labels[Math.floor(y/c.height*neckSkin.height)*neckSkin.width+Math.floor(x/c.width*neckSkin.width)];
  if(y>chin&&label===4){for(let ch=0;ch<4;ch++)if(pixels[i+ch]!==original.data[i+ch])throw Error('body changed');protectedPixels++}
  else if(pixels[i]!==original.data[i]){faceChanges++;if(y>chin&&label===2)neckChanges++}
  if(label===3&&y>face[10].y*c.height+30&&y<chin-15&&x>face[234].x*c.width+20&&x<face[454].x*c.width-20){baseLight+=original.data[i]*.2126+original.data[i+1]*.7152+original.data[i+2]*.0722;editLight+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;skinCount++}
  if(pixels[i+3]!==original.data[i+3])throw Error('alpha changed');
 }
 if(!skinCount||editLight<=baseLight)throw Error('makeup face must be brighter than Natural');
 if(!protectedPixels||!faceChanges||!neckChanges)throw Error('regions not exercised: '+[protectedPixels,faceChanges,neckChanges]);
 ctx.putImageData(new ImageData(altered,c.width,c.height),0,0);const raw=c.toDataURL();
 let measurements=0;const measureFace=async img=>{measurements++;return model.detect(img).faceLandmarks[0]};
 const head={studioSkinBaseSource:source,aiMakeupSource:raw};
 const fixed=await restrictPairedPortraitMakeup(head,{measureFace,measureSkin:async()=>neckSkin});
 const again=await restrictPairedPortraitMakeup(fixed,{measureFace,measureSkin:async()=>neckSkin});
 if(measurements!==1||again.aiMakeupSource!==fixed.aiMakeupSource)throw Error('repeated switches not cached');
 const fixedImage=new Image();fixedImage.src=fixed.aiMakeupSource;await fixedImage.decode();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(fixedImage,0,0);
 const saved=ctx.getImageData(0,0,c.width,c.height).data;
 for(let y=Math.ceil(chin)+1;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;const label=neckSkin.labels[Math.floor(y/c.height*neckSkin.height)*neckSkin.width+Math.floor(x/c.width*neckSkin.width)];if(label===4)for(let ch=0;ch<4;ch++)if(saved[i+ch]!==original.data[i+ch])throw Error('saved garment changed')}
 model.close();return {protectedPixels,faceChanges,neckChanges,naturalFaceLight:baseLight/skinCount,makeupFaceLight:editLight/skinCount,measurements,storedPairGarmentUnchanged:true};
}''')
 print(json.dumps(result));b.close()
