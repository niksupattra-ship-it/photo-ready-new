import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
import './studio-makeup.css';
const PORTRAIT_FINISHES=[
 {id:'korean-rosy-v1',name:'แต่งหน้า',preview:'/assets/face-finish/makeup.webp'},
 {id:'natural',name:'ไม่แต่งหน้า',preview:'/assets/face-finish/natural.webp'}
];
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead,portraitFinish=null,onPortraitFinishSelect,canSelectPortraitFinish=false,hasAiPair=false}){
 const additionalSelected=['soft-rosy-makeup-v1','soft-rosy-ai-v1'].includes(lookId);
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  <div className="studio-makeup-row">
   {canSelectPortraitFinish&&typeof onPortraitFinishSelect==='function'&&<div className="studio-makeup-choices studio-original-makeup-choices" aria-label="เมคอัพเดิม" style={{display:'contents'}}>
    {PORTRAIT_FINISHES.map(option=>{const finish=hasAiPair&&option.id!=='natural'?{...option,id:'makeup'}:option;return <button key={finish.id} type="button" disabled={disabled||!hasHead} aria-label={finish.name} aria-pressed={(hasAiPair?(portraitFinish==='natural'?'natural':'makeup'):portraitFinish)===finish.id&&!additionalSelected} className={'studio-makeup-choice studio-portrait-finish-choice'+((hasAiPair?(portraitFinish==='natural'?'natural':'makeup'):portraitFinish)===finish.id&&!additionalSelected?' active':'')} onClick={()=>onPortraitFinishSelect(finish.id)}>
     <span className="studio-makeup-face-preview"><img src={finish.preview} width="92" height="112" alt={finish.name} decoding="async"/></span>
     <small title={finish.name}>{finish.name}</small>
    </button>})}
   </div>}
   <div className="studio-makeup-choices" style={{display:'contents'}}>
    {MAKEUP_LOOKS.filter(look=>!look.ai).map(look=><button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={'ปรับ'+look.name} aria-pressed={lookId===look.id} className={'studio-makeup-choice'+(lookId===look.id?' active':'')} onClick={()=>onSelect(look.id)}>
     <span className="studio-makeup-face-preview"><img src={look.preview} width="92" height="112" alt={look.name} decoding="async" style={{filter:look.previewFilter}}/></span>
     <small title={look.name}>{look.name}</small>
    </button>)}
   </div>
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนปรับผิว</button></div>}
 </section>;
}
