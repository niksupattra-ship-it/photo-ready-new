import React,{useEffect,useRef} from 'react';
import './process-result-notice.css';
export function processResultKind(layer,{reused=false,privateTrial=false}={}){
 if(reused)return 'reused';
 if(privateTrial)return 'preview';
 return layer?.restrictedTrial===true?'trial':'paid';
}
export function ProcessResultNotice({notice,remaining,onClose,onDownload,onSave,onManage}){
 const panel=useRef(null);
 useEffect(()=>{const previous=document.activeElement;panel.current?.focus();return()=>previous?.focus?.()},[]);
 const trial=notice.kind==='trial',paid=notice.kind==='paid',saving=notice.saveState==='saving',saved=notice.saveState==='saved',full=notice.limitReached&&!saving&&!saved;
 const used=paid||trial?1:0;
 const knownRemaining=(notice.balanceState===undefined||notice.balanceState==='ready')&&typeof remaining==='number'&&Number.isFinite(remaining)&&remaining>=0;
 const creditUnit=trial?'เครดิตทดลอง':'เครดิต';
 return <div className="process-result-overlay"><section ref={panel} tabIndex={-1} className="process-result-card" role="dialog" aria-modal="true" aria-labelledby="process-result-title" aria-busy={saving} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===e.currentTarget)){e.preventDefault();first?.focus()}}}}>
  <span className="process-result-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9"/></svg></span>
  <h2 id="process-result-title">สร้างรูปสำเร็จแล้ว</h2>
  <div className="process-result-usage" aria-live="polite">
   <p>ใช้ <strong>{used}</strong> <span>{creditUnit}</span></p>
   <p>{notice.kind==='preview'?<><span>คงเหลือ</span> <strong>ไม่จำกัด</strong></>:knownRemaining?<>เหลือ <strong>{remaining}</strong> <span>{creditUnit}</span></>:<span className="process-result-balance-pending">{notice.balanceState==='error'?'ยังตรวจสอบยอดคงเหลือไม่ได้':'กำลังตรวจสอบยอดคงเหลือ…'}</span>}</p>
  </div>
  <div className="process-result-actions">
   <button type="button" className="process-result-primary" disabled={saving||saved} onClick={trial?onDownload:full?onManage:onSave}>{saving&&<span className="process-result-spinner" aria-hidden="true"/>}{trial?'รับรูปไม่มีลายน้ำ':saving?'กำลังบันทึก…':saved?'บันทึกงานแล้ว':full?'จัดการงานที่บันทึก':'บันทึกงาน'}</button>
   <button type="button" className="process-result-continue" onClick={onClose}>แก้ไขรูปต่อ<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button>
  </div>
 </section></div>;
}
