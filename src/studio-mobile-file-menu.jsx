import React,{useEffect,useRef,useState} from 'react';

export function StudioMobileFileMenu({disabled,onSave,onOpen,onWorks,onExport}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null);
 useEffect(()=>{
  if(!open)return;
  const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus()}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)};
 },[open]);
 useEffect(()=>{if(disabled)setOpen(false)},[disabled]);
 const actions=[['บันทึกงาน',()=>onSave?.()],['เปิดไฟล์โปรเจกต์',onOpen],['งานที่บันทึก',onWorks],['ดาวน์โหลด JPG',()=>onExport?.('image/jpeg')],['ดาวน์โหลด PNG',()=>onExport?.('image/png')]];
 return <div ref={root} className="studio-mobile-file-menu">
  <button ref={trigger} type="button" aria-label="เมนูบันทึกและดาวน์โหลด" aria-expanded={open} aria-controls="studio-mobile-file-options" disabled={disabled} onClick={()=>setOpen(v=>!v)}>
   <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
  </button>
  {open&&<div id="studio-mobile-file-options" className="studio-mobile-file-options" aria-label="จัดการงานและดาวน์โหลด">{actions.map(([label,action])=><button type="button" key={label} disabled={disabled} onClick={()=>{setOpen(false);trigger.current?.focus();void action?.()}}>{label}</button>)}</div>}
 </div>;
}
