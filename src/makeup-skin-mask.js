import {loadVisionRuntime} from './vision-runtime.js';
import {VISION_WASM_ROOT,PERSON_SEGMENTATION_MODEL} from './vision-assets.js';
let segmenter;
async function getSegmenter(){
 if(!segmenter){segmenter=(async()=>{const {FilesetResolver,ImageSegmenter}=await loadVisionRuntime();return ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks(VISION_WASM_ROOT),{baseOptions:{modelAssetPath:PERSON_SEGMENTATION_MODEL},runningMode:'IMAGE',outputCategoryMask:true})})();segmenter.catch(()=>{segmenter=null})}
 return segmenter;
}
// Body-skin label, never clothing: the face itself is bounded by landmarks.
export async function measureMakeupNeckSkin(image,{getSegmenter:resolveSegmenter=getSegmenter}={}){
 const model=await resolveSegmenter();
 return new Promise((resolve,reject)=>{try{model.segment(image,result=>{const mask=result.categoryMask;try{if(!mask)throw Error('ตรวจบริเวณผิวคอไม่สำเร็จ');resolve({width:mask.width,height:mask.height,labels:new Uint8Array(mask.getAsUint8Array())})}catch(e){reject(e)}finally{mask?.close?.()}})}catch(e){reject(e)}});
}
