import React,{useId} from 'react';
import {AccountFlowDialog} from './account-flow-dialog.jsx';
import './paid-work-warning.css';

const FALLBACK_PREVIEW='/assets/job-uniforms/female-formal-suit-example.png';

function WarningIcon({name,className=''}){
 const paths={
  download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 16v5h16v-5"/></>,
  card:<><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 10h18M7 15h4"/></>,
  check:<path d="m5 12 4 4L19 6"/>,
  lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  arrow:<><path d="M3 12h17m-7-7 7 7-7 7"/></>,
  close:<><path d="m5 5 14 14M19 5 5 19"/></>
 };
 return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

function PreviewCard({preview,locked=false}){
 return <div className={'paid-work-warning-photo'+(locked?' paid-work-warning-photo-locked':'')}>
  <div className="paid-work-warning-photo-image">
   <img src={preview||FALLBACK_PREVIEW} alt={locked?'ตัวอย่างรูปใหม่ที่มีลายน้ำ':'รูปเดิมที่ปลดล็อกแล้ว'} onError={event=>{if(event.currentTarget.getAttribute('src')!==FALLBACK_PREVIEW)event.currentTarget.src=FALLBACK_PREVIEW}}/>
   {locked&&<div className="paid-work-warning-watermark" aria-hidden="true">{Array.from({length:12},(_,i)=><span key={i}>IDพร้อม</span>)}</div>}
  </div>
  <div className="paid-work-warning-photo-label"><span className={'paid-work-warning-badge'+(locked?' paid-work-warning-badge-locked':'')}><WarningIcon name={locked?'lock':'check'}/></span><span><strong>{locked?'รูปใหม่':'รูปเดิม'}</strong><small>{locked?'มีลายน้ำ':'ปลดล็อกแล้ว'}</small></span></div>
 </div>;
}

// The caller decides whether the current work is paid and owns all navigation,
// downloading and saving. Dismissing this surface never changes the work.
export function PaidWorkWarning({kind='replace',preview,onDownload,onProceed,onClose,busy=false,onSaveExit}){
 const replace=kind==='replace',title=replace?'เพิ่มรูปใหม่?':'ออกจากหน้านี้?',id=useId();
 return <AccountFlowDialog label={title} busy={busy} onClose={onClose} initialFocus=".paid-work-warning-primary">
  <div className="paid-work-warning-backdrop">
   <section className={'paid-work-warning'+(replace?'':' paid-work-warning-exit')} aria-labelledby={id+'-title'} aria-describedby={id+'-message'} aria-busy={busy}>
    <button type="button" className="paid-work-warning-close" aria-label="กลับไปแก้ไขรูป" disabled={busy} onClick={onClose}><WarningIcon name="close"/></button>
    <h2 id={id+'-title'}>{title}</h2>
    {replace?<>
     <div className="paid-work-warning-comparison" aria-label="สิทธิ์รูปเดิมและรูปใหม่">
      <PreviewCard preview={preview}/><WarningIcon name="arrow" className="paid-work-warning-arrow"/><PreviewCard preview={preview} locked/>
     </div>
     <div className="paid-work-warning-notes">
      <div className="paid-work-warning-note"><span className="paid-work-warning-note-icon"><WarningIcon name="download"/></span><div><strong>ดาวน์โหลดรูปเดิมก่อน</strong><p>หลังเพิ่มรูปใหม่ จะย้อนกลับรูปเดิมในหน้านี้ไม่ได้</p></div></div>
      <div className="paid-work-warning-note"><span className="paid-work-warning-note-icon"><WarningIcon name="card"/></span><div><strong>รูปใหม่ต้องปลดล็อกอีกครั้ง</strong><p>สิทธิ์เดิมใช้ได้เฉพาะงานปัจจุบัน</p></div></div>
     </div>
     <p id={id+'-message'} className="paid-work-warning-loss">หากไม่ได้บันทึกหรือดาวน์โหลด งานที่ชำระแล้วจะเรียกคืนไม่ได้ และไม่สามารถขอเงินคืนได้</p>
    </>:<div className="paid-work-warning-exit-copy"><span className="paid-work-warning-exit-icon"><WarningIcon name="download"/></span><strong>{onSaveExit?'ดาวน์โหลดหรือบันทึกรูปก่อนออก':'ดาวน์โหลดรูปก่อนออก'}</strong><p id={id+'-message'}>หากไม่ได้เก็บรูปไว้ งานที่ชำระแล้วจะเรียกคืนไม่ได้<br className="paid-work-warning-desktop-break"/> และไม่สามารถขอเงินคืนได้</p></div>}
    <div className="paid-work-warning-actions">
     <button type="button" className="paid-work-warning-button paid-work-warning-primary" disabled={busy} onClick={onDownload}><WarningIcon name="download"/><span>ดาวน์โหลดรูปเดิม</span></button>
     {onSaveExit&&!replace&&<button type="button" className="paid-work-warning-button paid-work-warning-save" disabled={busy} onClick={onSaveExit}>บันทึกและออก</button>}
     <button type="button" className="paid-work-warning-button paid-work-warning-proceed" disabled={busy} onClick={onProceed}>{replace?'เพิ่มรูปใหม่':'ออกจากหน้า'}</button>
    </div>
   </section>
  </div>
 </AccountFlowDialog>;
}
