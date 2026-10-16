import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead}){
 return <section className="studio-makeup-panel" aria-label="ปรับผิว">
  <div className="studio-makeup-choices">
   {MAKEUP_LOOKS.map(look=><button key={look.id} type="button" disabled={disabled||!hasHead} aria-label={'ปรับ'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={{flex:'0 0 104px',width:104,minWidth:0,padding:6,textAlign:'center'}}>
    <span className="studio-makeup-face-preview"><img src={look.preview} width="92" height="112" alt={look.name} decoding="async" style={{display:'block',width:'100%',height:112,objectFit:'cover',borderRadius:8,filter:look.previewFilter}}/></span>
    <small style={{display:'block',marginTop:6}}>{look.name}</small>
   </button>)}
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนปรับผิว</button></div>}
 </section>;
}
