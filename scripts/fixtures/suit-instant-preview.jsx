import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import {startEnglishPreview,englishPreviewEnabled} from '../../src/english-preview.js';
import {ENGLISH_BODY_PORTRAIT_VERSION} from '../../english-body-portrait.js';
import source from '../../src/main.jsx?raw';
import '../../src/style.css';
const params=new URLSearchParams(location.search),processed=params.get('processed')!=='0',en=englishPreviewEnabled();
const catalog=Function(source.match(/const JOB_UNIFORMS=\[[\s\S]*?\n\];/)[0]+';return JOB_UNIFORMS')();
const ids=['female-job-ivory-bow-blouse','female-job-light-pink-tweed-pearl-trim','female-job-navy-suit-gathered-cream-blouse','female-job-dusty-rose-tweed-pearl-buttons'];
const options=catalog.filter(t=>ids.includes(t.id)).map(t=>({...t,name:t.title,group:'สมัครงาน'}));
const png=color=>{const c=document.createElement('canvas');c.width=900;c.height=1200;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,900,1200);return c.toDataURL()};
const portrait=document.createElement('canvas');portrait.width=900;portrait.height=1200;const q=portrait.getContext('2d');q.fillStyle='#d7a58a';q.beginPath();q.ellipse(450,390,162,220,0,0,Math.PI*2);q.fill();q.fillRect(380,580,140,350);
const face=Array.from({length:470},()=>({x:.5,y:.34}));Object.assign(face,{10:{x:.5,y:.15},152:{x:.5,y:.52},234:{x:.32,y:.34},454:{x:.68,y:.34},33:{x:.4,y:.32},263:{x:.6,y:.32}});
window.suitFixture={snapshot:{current:null},policies:[],faceCalls:0,rejectPolicy:false,ids,options,face,aiCalls:0};
const measureFace=async()=>{window.suitFixture.faceCalls++;await new Promise(r=>setTimeout(r,300));return face};window.suitFixture.measureFace=measureFace;
const layers=[{id:'background',name:'พื้นหลัง',kind:'background',source:png('#83c9ef')},{id:'head',name:processed?'หัว · คอ · ผม':'รูปที่เพิ่ม',kind:processed?'head':'source-photo',source:portrait.toDataURL(),jobId:processed?'fixture-job':null,portraitMode:'female',sourceFrame:{x:0,y:0,w:900,h:1200},...(en&&processed?{portraitComposition:ENGLISH_BODY_PORTRAIT_VERSION,generatedOutfitTemplate:'/fixture-original.png'}:{})},{id:'suit',name:'ชุด',kind:'suit',source:png('#333366'),templatePath:'/fixture-original.png',sourceFrame:{x:0,y:500,w:900,h:768}}];
startEnglishPreview();
createRoot(document.getElementById('root')).render(<StudioEditor initialEasy={params.has('easy')} purchaseSnapshotRef={window.suitFixture.snapshot} initialLayers={layers}
 placement={{W:900,H:1200,uX:0,uY:500,uW:900,uH:768,templatePath:'/fixture-original.png'}} templates={options} freeTemplatePaths={options.map(t=>t.template)}
 femaleHair={[]} maleHair={[]} backgrounds={[]} collarPins={[]} chestPins={[]} ribbons={[]} paidHairAccess paidOutputIds={['fixture-job']} editableOutputIds={['fixture-job']}
 onVerifyOutput={async()=>({checked:true,unlocked:true,fullEdit:true,paidDownload:true})} onMeasureSuitFace={measureFace}
 onSelectSuit={async(job,templates)=>{window.suitFixture.policies.push(templates);if(window.suitFixture.rejectPolicy)throw Error('fixture policy rejected');return {limited:false,choices:[]}}}
 onProcessPhoto={async()=>{window.suitFixture.aiCalls++;throw Error('No AI call is allowed during PNG selection')}} onClose={()=>{}}/>);
