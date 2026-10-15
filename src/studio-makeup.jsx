import React from 'react';
import {MAKEUP_LOOKS} from '../makeup-presets.js';
export function MakeupPanel({remaining=null,unlimited=false,lookId,intensity=100,onSelect,onIntensityChange,onIntensityCommit,canAdjustIntensity,disabled,hasHead}){
 return <section className="studio-makeup-panel" aria-label="เมคอัพตามแบบ">
  {(unlimited||remaining!==null)&&<p role="status" style={{fontSize:12,margin:'0 0 8px',color:'#8edbd5'}}>{unlimited?'สิทธิ์ส่วนตัว · เมคอัพ AI ไม่จำกัด':'สิทธิ์ AI ผม / เมคอัพ เหลือ '+remaining+' ครั้ง'}</p>}
  <div className="studio-makeup-choices">
   {MAKEUP_LOOKS.map(look=><button type="button" key={look.id} disabled={disabled||!hasHead} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)}><span style={{position:'relative',display:'block'}}><img src={look.preview} width="160" height="160" alt={look.description} loading="lazy" decoding="async"/><svg role="img" aria-label="เมคอัพ AI" width="16" height="16" viewBox="0 0 24 22" style={{position:'absolute',right:4,top:4,pointerEvents:'none'}}><path d="M2 7 7 1.5h10L22 7 12 20.5Z" fill="#42bfd9" stroke="#249dbb" strokeWidth=".8"/><path d="m7 1.5 5 5.5 5-5.5M2 7h20M7 1.5l5 19 5-19" fill="none" stroke="#c7f3fa" strokeWidth=".7"/></svg></span><small>{look.name}</small></button>)}
  </div>
  <p style={{fontSize:12,margin:'8px 0',color:'#8edbd5'}}>แต่งสำเร็จใช้ 1 สิทธิ์ AI ร่วมกับทรงผม · ใช้ผลเดิมไม่หักเพิ่ม</p>
  {canAdjustIntensity&&<label className="studio-makeup-intensity"><span>ความเข้ม <output>{intensity}%</output></span><input type="range" min="0" max="100" step="5" value={intensity} disabled={disabled} onChange={e=>onIntensityChange(Number(e.target.value))} onPointerUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onPointerCancel={e=>onIntensityCommit(Number(e.currentTarget.value))} onKeyUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onBlur={e=>onIntensityCommit(Number(e.currentTarget.value))}/></label>}
 </section>;
}
