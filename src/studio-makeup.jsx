import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
const PORTRAIT_FINISHES=[
 {id:'makeup',name:'แต่งหน้า',preview:'/assets/face-finish/makeup.webp'},
 {id:'natural',name:'ไม่แต่งหน้า',preview:'/assets/face-finish/natural.webp'}
];
const choiceStyle={flex:'0 0 104px',width:104,minWidth:0,padding:6,textAlign:'center'};
const previewStyle={display:'block',width:'100%',height:112,objectFit:'cover',borderRadius:8};
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead,portraitFinish=null,onPortraitFinishSelect,canSelectPortraitFinish=false}){
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  <div className="studio-makeup-choices">
   {MAKEUP_LOOKS.map(look=><button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={'ปรับ'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={choiceStyle}>
    <span className="studio-makeup-face-preview"><img src={look.preview} width="92" height="112" alt={look.name} decoding="async" style={{...previewStyle,filter:look.previewFilter}}/></span>
    <small style={{display:'block',marginTop:6}}>{look.name}</small>
   </button>)}
   {canSelectPortraitFinish&&typeof onPortraitFinishSelect==='function'&&PORTRAIT_FINISHES.map(finish=><button key={finish.id} type="button" disabled={disabled||!hasHead} aria-label={finish.name} aria-pressed={portraitFinish===finish.id} className={'studio-portrait-finish-choice'+(portraitFinish===finish.id?' active':'')} onClick={()=>onPortraitFinishSelect(finish.id)} style={choiceStyle}>
    <span className="studio-makeup-face-preview"><img src={finish.preview} width="92" height="112" alt={finish.name} decoding="async" style={previewStyle}/></span>
    <small style={{display:'block',marginTop:6}}>{finish.name}</small>
   </button>)}
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนปรับผิว</button></div>}
 </section>;
}
