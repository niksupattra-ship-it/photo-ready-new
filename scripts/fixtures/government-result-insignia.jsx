import {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS} from '../../hairstyle-catalog.js';
import {THAI_FREE_FEMALE_SUIT_IDS,THAI_FREE_MALE_SUIT_PATHS} from '../../thai-female-suit-policy.js';
import React from 'react';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../../english-body-portrait.js';
import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import '../../src/style.css';

// A finished-photo fixture using the real editor, original transparent garment
// and insignia PNGs. The painted head is deliberately not a customer photograph.
// Every authority/payment/provider callback is inert and recorded for assertions.
const query=new URLSearchParams(location.search);
const basic89=query.get('basic89')==='1',uploadedHair=query.get('uploadedHair')==='1';
const gender=query.get('gender')==='male'?'male':'female';
const narrow=query.get('composition')==='narrow';
const studio=query.get('studio')==='1',unpaid=query.get('unpaid')==='1';
const suitTest=(query.get('femaleSuits')==='1'||query.get('maleSuits')==='1'),pro=query.get('pro')==='1';
const freshSuitTest=suitTest&&query.get('fresh')==='1',workPro=query.get('workPro')==='1';
const femaleSuitTemplates=[{id:'female-job-taupe-cream-blouse',name:'ชุดโปร',template:'/assets/job-uniforms/female-job-taupe-cream-blouse.png',gender:'female',cat:'job',group:'สมัครงาน'},...THAI_FREE_FEMALE_SUIT_IDS.map((id,i)=>({id,name:'ฟรี '+(i+1),template:'/assets/job-uniforms/'+id+'.png',gender:'female',cat:'job',group:'สมัครงาน'}))];
const fullbody=query.get('fullbody')==='1';
const staleNeck=query.get('staleNeck')==='1';
const stalePatch=Object.assign(document.createElement('canvas'),{width:100,height:40});stalePatch.getContext('2d').fillStyle='#ff00ff';stalePatch.getContext('2d').fillRect(0,0,100,40);
const suitTemplates=query.get('maleSuits')==='1'?[{id:'paid-male',name:'ชุดโปรชาย',template:'/assets/job-uniforms/male-job-charcoal-burgundy-tie.png',gender:'male',cat:'job',group:'สมัครงาน'},...THAI_FREE_MALE_SUIT_PATHS.map((template,i)=>({id:'free-male-'+i,name:'ฟรีชาย '+(i+1),template,gender:'male',cat:'job',group:'สมัครงาน'}))]:femaleSuitTemplates;
const template='/assets/government-uniforms/'+(gender==='male'?'male-government-employee':'female-operational')+'.png';
const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src});
const make=()=>Object.assign(document.createElement('canvas'),{width:900,height:1200});
const blue=make(),head=make();
blue.getContext('2d').fillStyle='#3989e8';blue.getContext('2d').fillRect(0,0,900,1200);
const suit=await load(template);
const garmentWidth=narrow?650:900,garmentHeight=garmentWidth*suit.naturalHeight/suit.naturalWidth;
const frame={x:(900-garmentWidth)/2,y:1200-garmentHeight,w:garmentWidth,h:garmentHeight};
const h=head.getContext('2d'),headWidth=narrow?196:270,headHeight=headWidth*1.32;
const neckBottom=frame.y+frame.h*.20,headBottom=neckBottom-headWidth*.19;
h.fillStyle='#cda58a';h.fillRect(450-headWidth*.20,headBottom-headWidth*.15,headWidth*.4,headWidth*.4);
h.beginPath();h.ellipse(450,headBottom-headHeight/2,headWidth/2,headHeight/2,0,0,Math.PI*2);h.fill();
h.fillStyle='#322827';h.beginPath();h.ellipse(450,headBottom-headHeight*.87,headWidth*.51,headWidth*.3,0,Math.PI,Math.PI*2);h.fill();
if(fullbody)h.drawImage(suit,frame.x,frame.y,frame.w,frame.h);
const nativeSuit=document.createElement('canvas');nativeSuit.width=suit.naturalWidth;nativeSuit.height=suit.naturalHeight;nativeSuit.getContext('2d').drawImage(suit,0,0);
const originalFile=(freshSuitTest||basic89)?new File([await(await fetch(head.toDataURL())).blob()],'fixture-original.png',{type:'image/png'}):null;
const snapshotRef={current:null};
window.insigniaFixture={gender,narrow,studio,template,frame,aiCalls:0,paymentCalls:0,exports:[],snapshot:()=>snapshotRef.current?.()};
window.insigniaLayers=()=>window.insigniaFixture.snapshot()?.layers.map(layer=>Object.fromEntries([
 ...['id','kind','assetId','templatePath','sourceFrame','collarFrame','x','y','scale','rotation','visible','squeezeX','squeezeY','easyInsigniaManualPlacement','collarLeftX','collarRightX','collarLeftY','collarRightY','collarLeftScale','collarRightScale'].map(key=>[key,layer[key]]),
 ['sourceBytes',typeof layer.source==='string'?layer.source.length:0],['hasCollarParts',Boolean(layer.collarParts)]
]));
window.insigniaAlpha=async kind=>{
 const layer=window.insigniaFixture.snapshot()?.layers.find(l=>l.kind===kind);if(!layer)return null;
 const image=await load(layer.source),c=document.createElement('canvas');c.width=image.width;c.height=image.height;
 const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,0,0);
 const data=x.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=-1,bottom=-1,pixels=0;
 for(let py=0;py<c.height;py++)for(let px=0;px<c.width;px++)if(data[(py*c.width+px)*4+3]>8){left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);pixels++}
 return {width:c.width,height:c.height,pixels,bounds:{x:left,y:top,w:right-left+1,h:bottom-top+1},frame:layer.sourceFrame,scale:layer.scale,squeezeX:layer.squeezeX,squeezeY:layer.squeezeY};
};
window.insigniaCanvas=()=>document.querySelector('.thai-mobile-photo canvas');
window.captureInsigniaPixels=()=>{const c=window.insigniaCanvas();window.insigniaPrevious=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height);return {width:c.width,height:c.height}};
window.insigniaPixelDifference=()=>{
 const c=window.insigniaCanvas(),a=window.insigniaPrevious,b=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height);let count=0,left=c.width,top=c.height,right=-1,bottom=-1;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const p=(y*c.width+x)*4;if(Math.abs(a.data[p]-b.data[p])+Math.abs(a.data[p+1]-b.data[p+1])+Math.abs(a.data[p+2]-b.data[p+2])>15){count++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}}
 return {count,box:{x:left/c.width*900,y:top/c.height*1200,w:(right-left+1)/c.width*900,h:(bottom-top+1)/c.height*1200}};
};
const collarPins=[{id:'garuda-pair',name:'มท.',left:'/assets/government-insignia/garuda-left.png',right:'/assets/government-insignia/garuda-right.png'},
 {id:'education-pair',name:'ศึกษาธิการ',left:'/assets/government-insignia/education-left.png',right:'/assets/government-insignia/education-right.png'}];
const chestPins=[{id:'pao',name:'อบจ.',src:'/assets/government-insignia/chest-pao.png'},{id:'sao',name:'อบต.',src:'/assets/government-insignia/chest-sao.png'}];
const ribbons=[{id:'2504-2514',name:'2504-2514',src:'/assets/ribbons/2504-2514.png'},{id:'2515',name:'2515',src:'/assets/ribbons/2515.png'}];
const templateInfo={id:'government-fixture',name:'ชุดข้าราชการ',title:'ชุดข้าราชการ',cat:'government',gender,template,preview:template,img:template,group:'ข้าราชการ'};
createRoot(document.getElementById('root')).render(<StudioEditor initialEasy={!studio}
 initialSourcePhoto={originalFile}
 initialLayers={[
  {name:'พื้นหลัง',kind:'background',source:blue.toDataURL()},
  ...(freshSuitTest?[{id:'fixture-original',name:'รูปต้นฉบับ',kind:'source-photo',source:head.toDataURL(),...(workPro?{jobId:'fixture-government'}:{})}]:[{id:'fixture-head',name:'หัว · คอ · ผม',kind:'head',source:head.toDataURL(),jobId:'fixture-government',portraitMode:gender,generatedOutfitTemplate:template,restrictedTrial:unpaid,...(fullbody?{portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION}:{})}]),
  {name:'ชุด',kind:'suit',visible:!fullbody,source:nativeSuit.toDataURL(),sourceFrame:frame,collarFrame:frame,templatePath:template,assetId:templateInfo.id},
  ...(staleNeck?[{id:'stale-neck',name:'คอเก่า',kind:'neck-fit',hairHeadId:'fixture-head',source:stalePatch.toDataURL(),sourceFrame:{x:400,y:frame.y+frame.h*.18,w:100,h:40}}]:[])
 ]}
 templates={suitTest?suitTemplates:[templateInfo]} freeTemplatePaths={[template]} placement={{W:900,H:1200,uX:frame.x,uY:frame.y,uW:frame.w,uH:frame.h,templatePath:template}}
 collarPins={collarPins} chestPins={chestPins} ribbons={ribbons} backgrounds={[]}
 maleHair={(freshSuitTest||basic89)?[{id:'seedream-35',name:'ฟรีผมชาย',src:'/assets/seedream-hairstyles/previews/35-restored.webp'}]:[]}
 femaleHair={uploadedHair?[...THAI_FREE_FEMALE_HAIR_IDS.map(id=>PRODUCTION_HAIR_CATALOG.find(h=>h.id===id)),...PRODUCTION_HAIR_CATALOG.filter(h=>h.gender==='female'&&!h.hidden&&h.interfaceLanguage!=='en'&&!THAI_FREE_FEMALE_HAIR_IDS.includes(h.id))]:(freshSuitTest||basic89)?[{id:'seedream-14',name:'ฟรีผมหญิง',src:'/assets/seedream-hairstyles/previews/14.webp'}]:[]}
 paidOutputIds={unpaid?[]:['fixture-government']} editableOutputIds={unpaid?[]:['fixture-government']} hasCredits={!unpaid} allOptionsAvailable paidHairAccess premiumHairCreditAvailable={pro}
 onChangeHair={basic89?async(id,mode,finish,outfit)=>{window.insigniaFixture.aiCalls++;window.insigniaFixture.hairRequest={id,mode,finish,outfit};throw Error('FIXTURE_NO_PROVIDER')}:undefined}
 onVerifyOutput={async()=>({basicFreeHairOnly:basic89,basicAiOutfitTemplates:basic89?[template]:[],unlocked:!unpaid,fullEdit:!unpaid,paidDownload:!unpaid,premiumHair:!basic89&&!unpaid&&(suitTest?(pro||workPro):true)})}
 purchaseSnapshotRef={snapshotRef} onReceiveImage={async blob=>{window.insigniaFixture.exports.push({type:blob.type,size:blob.size,url:URL.createObjectURL(blob)});return {delivery:'fixture'}}}
 onBeforeProcess={basic89?async()=>true:async()=>{window.insigniaFixture.aiCalls++;throw Error('FIXTURE_NO_AI')}}
 onProcessPhoto={async()=>{window.insigniaFixture.aiCalls++;throw Error('FIXTURE_NO_AI')}}
 onRequestUnlock={context=>{window.insigniaFixture.paymentCalls++;window.insigniaFixture.offer=context;if(!suitTest&&!unpaid)throw Error('FIXTURE_NO_PAYMENT')}} onClose={()=>{}}/>);
