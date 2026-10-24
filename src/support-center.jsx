import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {SUPPORT_EMAIL,SUPPORT_TOPICS,SUPPORT_EVIDENCE} from './help-topics.js';
import './support-center.css';

function HelpIcon(){
 return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5M12 16h.01"/></svg>;
}

export function SupportDialog({onClose}){
 const panel=useRef(null),title=useId(),[copyStatus,setCopyStatus]=useState('');
 useEffect(()=>{
  const previous=document.activeElement,dialog=panel.current;
  dialog.showModal();
  return()=>{dialog.close();if(previous?.isConnected)previous.focus?.()};
 },[]);
 const copyEmail=async()=>{
  try{await navigator.clipboard.writeText(SUPPORT_EMAIL);if(panel.current?.open)setCopyStatus('คัดลอกอีเมลแล้ว')}
  catch{if(panel.current?.open)setCopyStatus('กดค้างหรือเลือกข้อความอีเมลเพื่อคัดลอกได้')}
 };
 const emailUrl='mailto:'+SUPPORT_EMAIL+'?subject='+encodeURIComponent('แจ้งปัญหาการใช้งาน IDพร้อม');
 return createPortal(<dialog ref={panel} className="idprom-support-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();e.stopPropagation();onClose()}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>
  <header className="idprom-support-header"><div><small>IDพร้อม · ศูนย์ช่วยเหลือ</small><h2 id={title}>ช่วยเหลือและติดต่อ</h2></div><button type="button" autoFocus onClick={onClose} aria-label="ปิดความช่วยเหลือ">×</button></header>
  <div className="idprom-support-content">
   <section className="idprom-support-contact" aria-label="ติดต่อทางอีเมล"><h3>ติดต่อทีมงานทางอีเมล</h3><p>หากยังแก้ไขไม่ได้ ส่งรายละเอียดปัญหาให้เราตรวจสอบ</p><div className="idprom-support-email-row"><a href={emailUrl}>{SUPPORT_EMAIL}</a><button type="button" onClick={copyEmail}>คัดลอกอีเมล</button></div><a className="idprom-support-send" href={emailUrl}>ส่งอีเมลถึงทีมงาน</a><p className="idprom-support-copy-status" role="status">{copyStatus}</p></section>
   <section className="idprom-support-troubleshooting" aria-label="วิธีแก้ปัญหาเบื้องต้น"><h3>ลองแก้ปัญหาเบื้องต้น</h3><p className="idprom-support-note">อย่ารีเฟรชหน้าหรือออกจากระบบระหว่างประมวลผลหรือบันทึกงาน และเก็บงานให้สำเร็จก่อนเปลี่ยนเบราว์เซอร์ เพื่อไม่ให้งานที่ยังไม่บันทึกสูญหาย</p><div className="idprom-support-topics">{SUPPORT_TOPICS.map(topic=><details key={topic.id}><summary>{topic.title}<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></summary><ol>{topic.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></details>)}</div></section>
   <section className="idprom-support-evidence" aria-label="ข้อมูลสำหรับแจ้งปัญหา"><h3>แจ้งปัญหาให้ตรวจสอบได้เร็วขึ้น</h3><ul>{SUPPORT_EVIDENCE.map(item=><li key={item}>{item}</li>)}</ul><p>ไม่ต้องส่งรหัสผ่าน รหัส OTP หรือข้อมูลบัตร</p></section>
  </div>
  <footer className="idprom-support-footer"><button type="button" onClick={onClose}>กลับไปใช้งาน</button></footer>
 </dialog>,document.body);
}

export function SupportCenter({compact=false}){
 const[open,setOpen]=useState(false);
 return <><button type="button" className={'idprom-support-trigger'+(compact?' is-compact':'')} onClick={()=>setOpen(true)} aria-label="ช่วยเหลือและติดต่อ" title="ช่วยเหลือและติดต่อ"><HelpIcon/>{!compact&&<span>ช่วยเหลือ</span>}</button>{open&&<SupportDialog onClose={()=>setOpen(false)}/>}</>;
}
