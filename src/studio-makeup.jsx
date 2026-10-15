import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
export function MakeupPanel({lookId,intensity=100,onSelect,onIntensityChange,onIntensityCommit,canAdjustIntensity,onRestore,canRestore,disabled,hasHead}){
 const look=MAKEUP_LOOKS[0];
 return <section className="studio-makeup-panel" aria-label="เมคอัพบนอุปกรณ์">
  <div className="studio-makeup-choices">
   <button type="button" disabled={disabled||!hasHead} aria-label={'แต่งหน้า'+look.name} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)} style={{flex:'1 1 auto',display:'flex',alignItems:'center',gap:10,padding:8,textAlign:'left',minWidth:0}}>
    <svg aria-hidden="true" width="52" height="52" viewBox="0 0 52 52" style={{flex:'0 0 52px'}}><rect x="1" y="1" width="50" height="50" rx="12" fill="#3e303f"/><path d="M11 37c6-10 16-11 28-6" fill="none" stroke="#ed9dab" strokeWidth="8" strokeLinecap="round" opacity=".7"/><path d="m20 28 13-14 5 5-14 13Z" fill="#bddfd7"/><path d="m17 29 5 5c-1 5-6 7-11 6 0-5 2-10 6-11Z" fill="#f7c4c9"/><path d="M39 7v6m-3-3h6" stroke="#f8e1e2" strokeWidth="1.5" strokeLinecap="round"/></svg>
    <span style={{minWidth:0}}><strong style={{display:'block',fontSize:13,color:'#f5d9df',marginBottom:3}}>{look.name}</strong><span style={{display:'block',fontSize:11,lineHeight:1.5,color:'#c4d1d7'}}>{look.description}</span></span>
   </button>
  </div>
  <div style={{fontSize:11,margin:'5px 0',color:'#8edbd5'}}>เมคอัพบนอุปกรณ์ · ไม่ส่งรูป · ไม่ใช้เครดิต</div>
  {canAdjustIntensity&&<label className="studio-makeup-intensity"><span>ความเข้ม <output>{intensity}%</output></span><input type="range" min="0" max="100" step="5" value={intensity} disabled={disabled} onChange={e=>onIntensityChange(Number(e.target.value))} onPointerUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onPointerCancel={e=>onIntensityCommit(Number(e.currentTarget.value))} onKeyUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onBlur={e=>onIntensityCommit(Number(e.currentTarget.value))}/></label>}
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled||!hasHead} onClick={onRestore}>คืนรูปก่อนแต่งหน้า</button></div>}
 </section>;
}
