import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
const PORTRAIT_FINISHES=[
 {id:'korean-rosy-v1',name:'แต่งหน้า',preview:'/assets/face-finish/makeup.webp'},
 {id:'natural',name:'ไม่แต่งหน้า',preview:'/assets/face-finish/natural.webp'}
];
const choiceStyle={flex:'0 0 104px',width:104,minWidth:0,padding:6,textAlign:'center'};
const previewStyle={display:'block',width:'100%',height:112,objectFit:'cover',borderRadius:8};
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead,portraitFinish=null,onPortraitFinishSelect,canSelectPortraitFinish=false}){
 const additionalSelected=lookId==='soft-rosy-makeup-v1'||MAKEUP_LOOKS.some(look=>look.ai&&look.id===lookId);
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  {canSelectPortraitFinish&&typeof onPortraitFinishSelect==='function'&&<div className="studio-makeup-choices studio-original-makeup-choices" aria-label="เมคอัพเดิม">
   {PORTRAIT_FINISHES.map(finish=><button key={finish.id} type="button" disabled={disabled||!hasHead} aria-label={finish.name} aria-pressed={portraitFinish===finish.id&&!additionalSelected} className={'studio-portrait-finish-choice'+(portraitFinish===finish.id&&!additionalSelected?' active':'')} onClick={()=>onPortraitFinishSelect(finish.id)} style={choiceStyle}>
    <span className="studio-makeup-face-preview"><img src={finish.preview} width="92" height="112" alt={finish.name} decoding="async" style={previewStyle}/></span>
    <small style={{display:'block',marginTop:6}}>{finish.name}</small>
   </button>)}
  </div>}
  <section className="studio-additional-ai-makeup" aria-label="เมคอัพ AI เพิ่มเติม" style={{marginTop:10,paddingTop:10,borderTop:'1px solid currentColor'}}>
   <h3 style={{fontSize:12,margin:'0 0 8px'}}>เมคอัพ AI เพิ่มเติม</h3>
   {MAKEUP_LOOKS.filter(look=>look.ai).map(look=><button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={'ปรับ'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={{display:'flex',alignItems:'center',gap:10,width:'100%',minWidth:0,padding:8,textAlign:'start',borderRadius:8}}>
    <img src={look.preview} width="48" height="60" alt={look.name} decoding="async" style={{width:48,height:60,objectFit:'cover',borderRadius:6,flex:'none'}}/>
    <span style={{minWidth:0}}><strong style={{display:'block',fontSize:11,lineHeight:1.5}}>{look.name}</strong><small style={{display:'block',fontSize:10,marginTop:4}}>ใช้สิทธิ์ AI ตามแพ็กเกจ</small></span>
   </button>)}
  </section>
  <div className="studio-makeup-choices">
   {MAKEUP_LOOKS.filter(look=>!look.ai).map(look=><button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={'ปรับ'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={choiceStyle}>
    <span className="studio-makeup-face-preview"><img src={look.preview} width="92" height="112" alt={look.name} decoding="async" style={{...previewStyle,filter:look.previewFilter}}/></span>
    <small style={{display:'block',marginTop:6}}>{look.name}</small>
   </button>)}
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนปรับผิว</button></div>}
 </section>;
}
