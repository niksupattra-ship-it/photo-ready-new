import React,{useState} from 'react';
import {FemaleFaceCompare} from '../../src/female-face-compare.jsx';
import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import {SOFT_ROSY_FINISH_VERSION,KOREAN_ROSY_FINISH_VERSION,NATURAL_FINISH_VERSION} from '../../src/portrait-finish-choice.js';
import {HAIR_DESIGN_VERSION} from '../../hairstyle-catalog.js';
import {startEnglishPreview} from '../../src/english-preview.js';
import '../../src/style.css';
const color=value=>{const c=Object.assign(document.createElement('canvas'),{width:900,height:1200});c.getContext('2d').fillStyle=value;c.getContext('2d').fillRect(0,0,900,1200);return c};
const base=color('#c39a87').toDataURL(),ai=color('#e8b7b0').toDataURL();
const stale=new URLSearchParams(location.search).has('stale');const staleFinish=new URLSearchParams(location.search).get('stale')==='natural'?'natural':new URLSearchParams(location.search).get('stale')==='original'?'korean-rosy-v1':'soft-rosy-v1';
const source=new File([await(await fetch(base)).blob()],'source.png',{type:'image/png'});source.idpromFemaleEyeStyle='korean-rosy-v1';
window.separateMakeup={current:null};window.separateMakeupCalls={ai:0,hair:[]};window.separateMakeupBase=base;
function InitialChoice(){const[value,setValue]=useState('natural');return <div id="initial-finish-fixture" style={{position:'fixed',zIndex:999999,top:80,left:10,width:300,background:'white'}}><FemaleFaceCompare value={value} onSelect={v=>{window.initialFinish=v;setValue(v)}}/></div>}
createRoot(document.getElementById('root')).render(<><InitialChoice/><StudioEditor initialSourcePhoto={source} purchaseSnapshotRef={window.separateMakeup}
 initialLayers={[{name:'พื้นหลัง',kind:'background',source:color('#427bd4').toDataURL()},{name:'หัว · คอ · ผม',kind:'head',source:ai,jobId:'fixture',portraitMode:'female',femaleEyeStyle:stale?staleFinish:'korean-rosy-v1',initialFemaleEyeStyle:stale?staleFinish:'korean-rosy-v1',hairId:'',hairPolicyVersion:HAIR_DESIGN_VERSION,makeupStyles:stale?undefined:{look:new URLSearchParams(location.search).has('legacy')?'soft-rosy-makeup-v1':'soft-rosy-ai-v1'},makeupBaseSource:base,makeupIntensity:100,makeupRenderVersion:'skin-current-layer-v2'}]}
 paidOutputIds={['fixture']} editableOutputIds={['fixture']} onVerifyOutput={async()=>({unlocked:true,fullEdit:true,paidDownload:true,premiumHair:true})}
 placement={{W:900,H:1200}} templates={[]} backgrounds={[]} maleHair={[]} femaleHair={[]} paidHairAccess canReuseHair={()=>true}
 onMakeup={async()=>{window.separateMakeupCalls.ai++;return color('#f0bcb4')}}
 onChangeHair={async(id,mode,finish)=>{window.separateMakeupCalls.hair.push({id,mode,finish});return {reused:true,layer:{name:'หัว · คอ · ผม',kind:'head',source:finish==='natural'?color('#ba9c88').toDataURL():base,jobId:'fixture',hairId:id,portraitMode:mode,femaleEyeStyle:finish,initialFemaleEyeStyle:finish,...(finish==='soft-rosy-v1'?{softRosyFinishVersion:SOFT_ROSY_FINISH_VERSION}:{}),...(finish==='korean-rosy-v1'?{koreanRosyFinishVersion:KOREAN_ROSY_FINISH_VERSION}:{}),...(finish==='natural'?{naturalFinishVersion:NATURAL_FINISH_VERSION}:{})},commit:()=>{},rollback:()=>{}}}}
 onFinishProcess={async()=>{}} onClose={()=>{}}/></>);
startEnglishPreview();
