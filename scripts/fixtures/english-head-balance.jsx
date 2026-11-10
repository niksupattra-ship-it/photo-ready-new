import React from 'react';import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import {startEnglishPreview} from '../../src/english-preview.js';
import {decodedStudioImage} from '../../src/studio-image-cache.js';
import {copyStudioSkinBlobMetadata} from '../../src/shared-studio-skin.js';
import {portraitFinishChoice} from '../../src/portrait-finish-choice.js';
import {planEnglishHeadBalance,applyEnglishHeadBalance,balancedEnglishLandmarks,ENGLISH_HEAD_BALANCE_VERSION} from '../../src/english-head-balance.js';
import {ENGLISH_BODY_PORTRAIT_VERSION,ENGLISH_BODY_FRAMING_VERSION} from '../../english-body-portrait.js';
import source from '../../src/main.jsx?raw';import '../../src/style.css';
const W=450,H=600,c=Object.assign(document.createElement('canvas'),{width:W,height:H}),ctx=c.getContext('2d'),labels=new Uint8Array(W*H),face=[];
const rect=(x,y,w,h,color,label)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)labels[yy*W+xx]=label};
rect(145,45,160,195,'#cca282',3);rect(145,45,160,50,'#211a1a',1);rect(190,230,70,90,'#cca282',2);rect(25,280,400,320,'#253752',4);
for(const [id,x,y]of [[10,225,100],[152,225,240],[234,145,170],[454,305,170]])face[id]={x:x/W,y:y/H};
const natural=c.toDataURL();ctx.fillStyle='#f2aaa9';ctx.fillRect(185,190,80,18);const makeup=c.toDataURL(),blank=Object.assign(document.createElement('canvas'),{width:W,height:H});blank.getContext('2d').fillStyle='#ffffff';blank.getContext('2d').fillRect(0,0,W,H);
const fixture=window.headFixture={snapshot:{current:null},restores:[],calls:0};
const decode=async source=>{if(!(source instanceof Blob))return decodedStudioImage(source);const url=URL.createObjectURL(source);try{return await decodedStudioImage(url)}finally{URL.revokeObjectURL(url)}};
const env={planEnglishHeadBalance,applyEnglishHeadBalance,ENGLISH_HEAD_BALANCE_VERSION,ENGLISH_BODY_FRAMING_VERSION,assertProcessActive(){},decodedPortraitImage:decode,portraitFaceLandmarks:async blob=>{if(blob.idpromEnglishHeadBalancePlan)return balancedEnglishLandmarks(face,blob.idpromEnglishHeadBalancePlan,W,H);const im=await decode(blob),c=Object.assign(document.createElement('canvas'),{width:W,height:H}),q=c.getContext('2d',{willReadFrequently:true});q.drawImage(im,0,0);const d=q.getImageData(0,170,W,1).data;let l=W,r=0;for(let x=0;x<W;x++)if(d[x*4+3]>128){l=Math.min(l,x);r=Math.max(r,x+1)}const scale=(r-l)/160;return balancedEnglishLandmarks(face,{applied:true,anchorX:225,anchorY:240,scale},W,H)},canvasFor:(width,height)=>Object.assign(document.createElement('canvas'),{width,height}),getPersonSegmenter:async()=>({segment:()=>({categoryMask:{width:W,height:H,getAsUint8Array:()=>labels,close(){}}})}),canvasPng:canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png')),copyStudioSkinBlobMetadata,portraitFinishChoice};
const a=source.indexOf('async function balanceEnglishPortrait('),z=source.indexOf('\nasync function aiFinishPortrait(',a),balance=Function('env',`with(env){${source.slice(a,z)};return balanceExistingEnglishPortraitLayer}`)(env);
startEnglishPreview();
createRoot(document.getElementById('root')).render(<StudioEditor purchaseSnapshotRef={fixture.snapshot} initialLayers={[{kind:'background',name:'พื้นหลัง',source:blank.toDataURL()},{id:'head',name:'หัว · คอ · ผม',kind:'head',source:makeup,studioSkinBaseSource:natural,aiMakeupSource:makeup,studioSkinVersion:'studio-original-ai-v5-clear-gathered-v1',sharedPortraitBaseVersion:'natural-base-v1-locked-hair-edges',femaleEyeStyle:'makeup',portraitMode:'female',portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,portraitFramingVersion:'outfit-complete-frame-v7-smaller-head-fixed-neck',jobId:'same-owned-job',sourceFrame:{x:0,y:0,w:900,h:1200}}]}
 placement={{W:900,H:1200,uX:0,uY:0,uW:900,uH:1200}} templates={[]} backgrounds={[]} collarPins={[]} chestPins={[]} ribbons={[]} maleHair={[]} femaleHair={[]} paidOutputIds={['same-owned-job']} editableOutputIds={['same-owned-job']}
 onBalanceHead={async(...args)=>{fixture.calls++;return balance(...args)}} onRestorePortraitFinish={head=>fixture.restores.push(head)} onVerifyOutput={async()=>({checked:true,unlocked:true,paidDownload:true,fullEdit:true})} onSelectSuit={async()=>({limited:false,choices:[]})} onClose={()=>{}} />);
