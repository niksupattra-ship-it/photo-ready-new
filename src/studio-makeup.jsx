import React,{useState} from 'react';
import {MAKEUP_TABS,MAKEUP_PRESETS} from '../makeup-presets.js';

export function MakeupPanel({styles,onStyles,onApply,onRestore,canRestore,disabled,hasHead}){
 const [tab,setTab]=useState('brows');
 return <section className="studio-makeup-panel" aria-label="เมคอัพ">
  <h2>เมคอัพ</h2>
  <div className="studio-makeup-tabs" role="tablist" aria-label="ประเภทเมคอัพ">{MAKEUP_TABS.map(([id,name])=><button type="button" key={id} role="tab" id={'makeup-tab-'+id} aria-controls="makeup-choices" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{name}{styles[id]&&<i aria-label="เลือกแล้ว">●</i>}</button>)}</div>
  <div className="studio-makeup-choices" id="makeup-choices" role="tabpanel" aria-labelledby={'makeup-tab-'+tab}>
   <button type="button" className={!styles[tab]?'active':''} aria-pressed={!styles[tab]} disabled={disabled} onClick={()=>{const next={...styles};delete next[tab];onStyles(next)}}><span className="studio-makeup-none">⊘</span><small>ไม่แต่ง</small></button>
   {MAKEUP_PRESETS[tab].map(([id,name],i)=><button type="button" key={id} disabled={disabled} aria-pressed={styles[tab]===id} className={styles[tab]===id?'active':''} onClick={()=>onStyles({...styles,[tab]:id})}><img src={`/assets/makeup/${tab}-${i+1}.webp`} width="128" height="128" alt={'ตัวอย่าง'+name} loading="lazy" decoding="async"/><small>{name}</small></button>)}
  </div>
  <div className="studio-makeup-actions"><button type="button" className="studio-makeup-apply" disabled={disabled||!hasHead||!Object.keys(styles).length} onClick={onApply}>ใช้เมคอัพ · ไม่จำกัด</button>{canRestore&&<button type="button" disabled={disabled} onClick={onRestore}>คืนก่อนแต่ง</button>}</div>
  <p>{hasHead?'เลือกได้หลายหมวด แล้วกดใช้เมคอัพครั้งเดียว':'เพิ่มรูปและประมวลผลก่อนใช้เมคอัพ'} · ภาพตัวอย่างประกอบการเลือก</p>
 </section>;
}

