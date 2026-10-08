import React,{useEffect,useState} from 'react';
import {MAKEUP_LOOKS,makeupLook} from '../makeup-presets.js';

export function MakeupPanel({lookId,intensity=100,onSelect,onIntensityChange,onIntensityCommit,onRestore,canRestore,canAdjustIntensity,disabled,hasHead}){
 const [gender,setGender]=useState(()=>makeupLook(lookId)?.gender||'female');
 useEffect(()=>{const look=makeupLook(lookId);if(look)setGender(look.gender)},[lookId]);
 return <section className="studio-makeup-panel" aria-label="เมคอัพสำเร็จรูป">
  <h2>เมคอัพสำเร็จรูป</h2>
  <div className="studio-makeup-tabs" role="tablist" aria-label="โทนเมคอัพชายหญิง">{[['female','หญิง'],['male','ชาย']].map(([id,name])=><button type="button" key={id} role="tab" id={'makeup-tab-'+id} aria-controls="makeup-choices" aria-selected={gender===id} disabled={disabled} className={gender===id?'active':''} onClick={()=>setGender(id)}>{name}</button>)}</div>
  <div className="studio-makeup-choices" id="makeup-choices" role="tabpanel" aria-labelledby={'makeup-tab-'+gender}>
   {MAKEUP_LOOKS.filter(look=>look.gender===gender).map(look=><button type="button" key={look.id} disabled={disabled||!hasHead} aria-pressed={lookId===look.id} className={lookId===look.id?'active':''} onClick={()=>onSelect(look.id)}><img src={look.preview} width="160" height="160" alt={'ตัวอย่างโทน'+look.name} loading="lazy" decoding="async"/><small>{look.name}</small><span className="studio-makeup-description">{look.description}</span>{look.recommended&&<span className="studio-makeup-recommended">แนะนำ</span>}</button>)}
  </div>
  {canAdjustIntensity&&<label className="studio-makeup-intensity"><span>ความเข้ม <output>{intensity}%</output></span><input type="range" min="0" max="100" step="5" value={intensity} disabled={disabled} onChange={e=>onIntensityChange(Number(e.target.value))} onPointerUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onKeyUp={e=>onIntensityCommit(Number(e.currentTarget.value))} onBlur={e=>onIntensityCommit(Number(e.currentTarget.value))}/></label>}
  {canRestore&&<div className="studio-makeup-actions"><button type="button" disabled={disabled} onClick={onRestore}>คืนก่อนแต่ง</button></div>}
  <p>{hasHead?'กดโทนเพื่อแต่งครบทั้งหน้า · ใช้ได้ไม่จำกัด ไม่หักเครดิต':'เพิ่มรูปและประมวลผลก่อนใช้เมคอัพ'} · ภาพตัวอย่างประกอบการเลือก</p>
 </section>;
}
