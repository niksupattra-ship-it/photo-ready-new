import {englishPreviewEnabled} from './english-preview.js';
import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {SUPPORT_EMAIL,SUPPORT_TOPICS,SUPPORT_TOPICS_EN} from './help-topics.js';
import './support-center.css';

function HelpIcon(){
 return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.5M12 16h.01"/></svg>;
}
function MailIcon(){
 return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></svg>;
}

export function SupportDialog({onClose}){
 const english=englishPreviewEnabled();
 const panel=useRef(null),title=useId();
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  const previous=document.activeElement,dialog=panel.current;
  dialog.showModal();
  return()=>{dialog.close();if(previous?.isConnected)previous.focus?.()};
 },[]);
 const copyEmail=async()=>{
  try{
   await navigator.clipboard.writeText(SUPPORT_EMAIL);
   if(panel.current?.open)setCopied(true);
  }catch{
   if(panel.current?.open)setCopied(false);
  }
 };
 const subject=english?'IDPROM Support Request':'แจ้งปัญหาการใช้งาน IDพร้อม';
 const emailUrl='mailto:'+SUPPORT_EMAIL+'?subject='+encodeURIComponent(subject);
 return createPortal(<dialog ref={panel} className="idprom-support-dialog" aria-labelledby={title}
  onCancel={e=>{e.preventDefault();e.stopPropagation();onClose()}}
  onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>
  <header className="idprom-support-header"><div>
   <small>{english?'IDPROM · Help Center':'IDพร้อม · ศูนย์ช่วยเหลือ'}</small>
   <h2 id={title}>{english?'Help & Support':'ช่วยเหลือและติดต่อ'}</h2>
  </div><button type="button" autoFocus onClick={onClose} aria-label={english?'Close support':'ปิดความช่วยเหลือ'}>×</button></header>
  <div className="idprom-support-content" lang={english?'en':'th'}>
   <section className="idprom-support-contact" aria-label={english?'Contact support by email':'ติดต่อทางอีเมล'}>
    <h3>{english?'Contact Support':'ติดต่อฝ่ายสนับสนุน'}</h3>
    <p>{english?
     'If you encounter an issue, please email us a description of the problem. Our support team will review your request and assist you.':
     'หากพบปัญหาการใช้งาน กรุณาส่งรายละเอียดมาที่อีเมลด้านล่าง เพื่อให้ทีมงานตรวจสอบและช่วยเหลือ'}</p>
    <div className="idprom-support-email-row">
     <a href={emailUrl}>{SUPPORT_EMAIL}</a>
     <button type="button" onClick={copyEmail}>{copied?(english?'Copied':'คัดลอกแล้ว'):(english?'Copy email':'คัดลอกอีเมล')}</button>
    </div>
    <div className="idprom-support-actions">
     <a className="idprom-support-send" href={emailUrl}><MailIcon/>{english?'Send Email':'ส่งอีเมล'}</a>
    </div>
   </section>
   <section className="idprom-support-troubleshooting" aria-label={english?'Troubleshooting':'วิธีแก้ปัญหาเบื้องต้น'}>
    <h3>{english?'Troubleshooting':'ลองแก้ปัญหาเบื้องต้น'}</h3>
    <p className="idprom-support-note">{english?
     'Avoid refreshing or closing the page during processing or downloads. Check that your files are saved before leaving.':
     'อย่ารีเฟรชหรือปิดหน้าระหว่างประมวลผลหรือดาวน์โหลด และตรวจสอบว่าไฟล์อยู่ในอุปกรณ์แล้วก่อนออกจากหน้าการใช้งาน'}</p>
    <div className="idprom-support-topics">{(english?SUPPORT_TOPICS_EN:SUPPORT_TOPICS).map(topic=><details key={topic.id}><summary>{topic.title}<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></summary>{topic.steps.map((step,i)=><p key={i} style={{margin:'0 18px 16px'}}>{step}</p>)}</details>)}</div>
   </section>
  </div>
  <footer className="idprom-support-footer"><button type="button" onClick={onClose}>{english?'Return to editing':'กลับไปใช้งาน'}</button></footer>
 </dialog>,document.body);
}

export function SupportCenter({compact=false}){
 const [open,setOpen]=useState(false),english=englishPreviewEnabled();
 const ariaLabel=english?'Help & Support':'ช่วยเหลือและติดต่อ';
 return <><button type="button" className={'idprom-support-trigger'+(compact?' is-compact':'')} onClick={()=>setOpen(true)} aria-label={ariaLabel} title={ariaLabel}><HelpIcon/>{!compact&&<span>{english?'Help':'ช่วยเหลือ'}</span>}</button>{open&&<SupportDialog onClose={()=>setOpen(false)}/>}</>;
}
