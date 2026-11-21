import React,{useState} from 'react';
import './government-insignia-chooser.css';

// This panel uses the existing Studio asset library and its undo/export path.
// It never creates an AI job or chooses a civil-service rank for the customer.
export function GovernmentInsigniaChooser({collarPins=[],chestPins=[],ribbons=[],selected={},busy=false,onChoose,onClose,quickResult=false,placementReview=false}){
 const [tab,setTab]=useState('collar');
 const tabs=[['collar','ปกคอ'],['chest','เข็มติดอก'],['ribbon','แพรแถบ'],...(!quickResult?[['shoulder','บ่า']]:[])];
 const options=tab==='collar'?collarPins:tab==='chest'?chestPins:tab==='ribbon'?ribbons:[];
 return <section className="idprom-government-insignia" aria-label="เลือกเครื่องหมายชุดข้าราชการ">
  {!quickResult&&<header className="idprom-government-insignia-head">
   <div><h3>เครื่องหมายข้าราชการ</h3><p>แตะเครื่องหมายที่ต้องการ ระบบจะจัดวางบนรูปที่สร้างแล้ว</p></div>
   {onClose&&<button type="button" onClick={onClose} aria-label="ปิดเครื่องหมาย">×</button>}
  </header>}
  <nav className="idprom-government-insignia-tabs" aria-label="ประเภทเครื่องหมาย">
   {tabs.map(([id,label])=><button type="button" key={id} className={tab===id?'selected':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
  </nav>
  {tab==='shoulder'?<div className="idprom-government-insignia-note" role="status">
   <strong>เครื่องหมายบ่า</strong>
   <p>ในเวอร์ชันนี้ เครื่องหมายบ่าเป็นส่วนหนึ่งของแบบชุดที่เลือกไว้แล้ว หากต้องการเปลี่ยนระดับให้เปลี่ยนแบบชุดก่อนสร้าง AI ใหม่ ไม่วางเครื่องหมายใหม่ทับบ่าเดิม</p>
  </div>:<>
   <div className="idprom-government-insignia-options">
    <button type="button" className={!selected[tab]?'selected':''} disabled={busy} onClick={()=>onChoose(tab,null)}>
     <span className="idprom-government-empty" aria-hidden="true">∅</span><span>ไม่ติด</span>
    </button>
    {options.map(option=><button type="button" key={option.id||option.src||option.left} className={selected[tab]===option.id?'selected':''} disabled={busy} aria-pressed={selected[tab]===option.id} onClick={()=>onChoose(tab,option)}>
     <span className="idprom-government-option-images">
      <img src={option.left||option.src||option.preview} loading="lazy" decoding="async" alt=""/>
      {tab==='collar'&&option.right&&<img src={option.right} loading="lazy" decoding="async" alt=""/>}
     </span>
     <span>{option.name||option.title||'เครื่องหมาย'}</span>
    </button>)}
   </div>
   {!options.length&&<p className="idprom-government-insignia-note">ไม่มีเครื่องหมายในหมวดนี้</p>}
   {!quickResult&&<p className="idprom-government-insignia-help">เลือกแล้วแสดงบนภาพทันที ไม่เรียก AI ใหม่ · ตรวจชนิดเครื่องหมายและสิทธิ์ที่ได้รับจริงก่อนดาวน์โหลด</p>}
  </>}
  {quickResult&&placementReview&&<p className="idprom-government-insignia-help" role="status">ระบบยังระบุตำแหน่งจากชุดนี้ได้ไม่ชัด ตรวจตำแหน่งบนรูปแล้วลากเครื่องหมายปรับก่อนรับรูป</p>}
  {onClose&&<button className="idprom-government-insignia-done" type="button" onClick={onClose}>เสร็จแล้ว · กลับไปดูรูป</button>}
 </section>;
}
