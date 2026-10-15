import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
export function MakeupPanel({lookId,onSelect,onRestore,canRestore,disabled,hasHead}){
 const look=MAKEUP_LOOKS[0];
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  <div className="studio-makeup-choices">
   <button type="button" disabled={disabled||!hasHead} aria-label={'แต่งหน้า'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={{flex:'0 0 104px',width:104,minWidth:0,padding:6,textAlign:'center'}}>
    <img src="/assets/makeup/looks/local-natural-pink-v1.webp" width="92" height="112" alt={look.name} decoding="async" style={{display:'block',width:'100%',height:112,objectFit:'cover',borderRadius:8}}/>
    <small style={{display:'block',marginTop:6}}>{look.name}</small>
   </button>
  </div>
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนแต่งหน้า</button></div>}
 </section>;
}
