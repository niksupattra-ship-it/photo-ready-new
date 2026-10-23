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
 return <div className="process-result-overlay"><section ref={panel} tabIndex={-1} className="process-result-card" role="dialog" aria-modal="true" aria-labelledby="process-result-title" aria-describedby="process-result-description" aria-busy={saving} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===e.currentTarget)){e.preventDefault();first?.focus()}}}}>
  <span className="process-result-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9"/></svg></span>
  <h2 id="process-result-title">สร้างรูปสำเร็จแล้ว</h2>
  <div className="process-result-usage" aria-live="polite">
   <p>ใช้ <strong>{used}</strong> <span>{creditUnit}</span></p>
   <p>{notice.kind==='preview'?<><span>คงเหลือ</span> <strong>ไม่จำกัด</strong></>:knownRemaining?<>เหลือ <strong>{remaining}</strong> <span>{creditUnit}</span></>:<span className="process-result-balance-pending">{notice.balanceState==='error'?'ยังตรวจสอบยอดคงเหลือไม่ได้':'กำลังตรวจสอบยอดคงเหลือ…'}</span>}</p>
  </div>
  <div className="process-result-warning">
   <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7.25"/><path d="M10 8.5v4.5M10 6h.01"/></svg>
   <p id="process-result-description">หากออกจากหน้า <strong>IDพร้อม <em>Studio</em></strong> งานที่ยังไม่บันทึกจะหายไป และเครดิตที่ใช้แล้วไม่สามารถเรียกคืนได้</p>
  </div>
  <div className={'process-result-storage '+(saved?'is-saved':full||notice.saveState==='error'?'is-error':'')} role="status" aria-live="polite">
   <strong>{saving?'กำลังบันทึกงาน…':full?'บันทึกงานครบ 3 งานแล้ว':saved?'บันทึกงานสำเร็จแล้ว':trial?'รูปทดลองยังมีลายน้ำ':notice.saveState==='error'?'บันทึกงานไม่สำเร็จ':'ยังไม่ได้บันทึกงาน'}</strong>
   {saving?<p>กรุณารอให้บันทึกสำเร็จก่อนออกจากหน้า Studio</p>:full?<p>กรุณาลบงานเดิม 1 งาน แล้วกลับมาบันทึกงานนี้อีกครั้ง</p>:saved?<p>เปิดแก้ไขต่อจาก “งานของฉัน” ด้วยอีเมลเดิมได้</p>:trial?<p>เลือกแพ็กเกจเพื่อรับรูปไม่มีลายน้ำ แล้วบันทึกงานเก็บไว้</p>:notice.message?<p>{notice.message}</p>:null}
  </div>
  <div className="process-result-actions">
   <button type="button" className="process-result-primary" disabled={saving||saved} onClick={trial?onDownload:full?onManage:onSave}>{saving&&<span className="process-result-spinner" aria-hidden="true"/>}{trial?'รับรูปไม่มีลายน้ำ':saving?'กำลังบันทึก…':saved?'บันทึกงานแล้ว':full?'จัดการงานที่บันทึก':'บันทึกงาน'}</button>
   <button type="button" className="process-result-continue" onClick={onClose}>แก้ไขรูปต่อ<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button>
  </div>
 </section></div>;
}
