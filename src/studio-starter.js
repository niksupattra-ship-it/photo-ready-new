import catalog from './studio-starters.json' with {type:'json'};
import {withDeadline} from './async-deadline.js';

export function studioStarterPlan(template,background){
 const uniform=catalog.uniforms[template],size=catalog.backgrounds[background.src];
 if(!uniform||!size)return null;
 const {width,height,left,opaqueWidth,socketY}=uniform,W=size.width,H=size.height;
 const uScale=(W+4)/opaqueWidth,uW=width*uScale,uH=height*uScale,uX=-2-left*uScale,uY=H*.425+socketY*(W*.94/width)-socketY*uScale;
 return {preview:uniform.preview,background:background.src,backgroundId:background.id,placement:{W,H,uX,uY,uW,uH,templatePath:template}};
}

const blobSource=blob=>new Promise((resolve,reject)=>{
 const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('อ่านภาพตัวอย่างไม่สำเร็จ'));reader.readAsDataURL(blob);
});

export async function prepareStudioStarter(plan,{fetchImage=fetch,encode=blobSource,signal}={}){
 const read=source=>withDeadline(async()=>{
  const response=await fetchImage(source,{signal});if(!response.ok)throw Error('โหลดภาพตัวอย่างไม่สำเร็จ');
  return encode(await response.blob());
 },{timeoutMs:15000,message:'โหลดภาพตัวอย่างใช้เวลานาน กรุณาลองเปิด Studio อีกครั้ง',code:'STUDIO_STARTER_TIMEOUT'});
 const [background,suit]=await Promise.all([read(plan.background),read(plan.preview)]);
 if(signal?.aborted)throw Object.assign(Error('ยกเลิกการเปิด Studio'),{name:'AbortError'});
 const p=plan.placement;
 return {placement:p,layers:[
  {name:'พื้นหลัง',kind:'background',assetId:plan.backgroundId,source:background,sourceFrame:{x:0,y:0,w:900,h:1200}},
  {name:'ชุด',kind:'suit',templatePath:p.templatePath,suitPreviewOnly:true,source:suit,sourceFrame:{x:p.uX/p.W*900,y:p.uY/p.H*1200,w:p.uW/p.W*900,h:p.uH/p.H*1200}}
 ]};
}
