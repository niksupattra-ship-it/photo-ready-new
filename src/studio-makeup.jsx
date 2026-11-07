import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
import {SOFT_ROSY_PORTRAIT_FINISH} from './portrait-finish-choice.js';
import './studio-makeup.css';
const PORTRAIT_FINISHES=[
 {id:'korean-rosy-v1',name:'แต่งหน้า',preview:'/assets/face-finish/makeup.webp'},
 {id:'natural',name:'ไม่แต่งหน้า',preview:'/assets/face-finish/natural.webp'}
];
const LOCAL_LABELS={'skin-bright-v1':'ผิวสว่าง','skin-glow-v1':'ผิววาว','skin-smooth-v1':'ผิวเนียน'};
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead,portraitFinish=null,onPortraitFinishSelect,canSelectPortraitFinish=false}){
 const additionalSelected=['soft-rosy-makeup-v1','soft-rosy-ai-v1'].includes(lookId);
 const finishButton=finish=>{
  const active=portraitFinish===finish.id&&!additionalSelected;
  return <button key={finish.id} type="button" disabled={disabled||!hasHead} aria-label={finish.name} aria-pressed={active} className={'studio-makeup-choice studio-portrait-finish-choice'+(active?' active':'')} onClick={()=>onPortraitFinishSelect(finish.id)}>
   <span className="studio-makeup-face-preview"><img src={finish.preview} width="76" height="96" alt="" decoding="async"/></span>
   <small>{finish.name}</small>
  </button>;
 };
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  <div className="studio-makeup-choices studio-makeup-options">
   {canSelectPortraitFinish&&typeof onPortraitFinishSelect==='function'&&<>
    <div className="studio-original-makeup-choices">{PORTRAIT_FINISHES.map(finishButton)}</div>
    <div className="studio-additional-ai-makeup">{finishButton(SOFT_ROSY_PORTRAIT_FINISH)}</div>
   </>}
   {MAKEUP_LOOKS.filter(look=>!look.ai).map(look=>{
    const name=LOCAL_LABELS[look.id]||look.name;
    return <button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={name} aria-pressed={lookId===look.id} className={'studio-makeup-choice'+(lookId===look.id?' active':'')} onClick={()=>onSelect(look.id)}>
     <span className="studio-makeup-face-preview"><img src={look.preview} width="76" height="96" alt="" decoding="async" style={{filter:look.previewFilter}}/></span>
     <small>{name}</small>
    </button>;
   })}
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนปรับผิว</button></div>}
 </section>;
}
