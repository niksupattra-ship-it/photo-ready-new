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
 const trial=notice.kind==='trial',paid=notice.kind==='paid',saving=notice.saveState==='saving',saved=notice.saveState==='saved';
 return <div className="process-result-overlay"><section ref={panel} tabIndex={-1} className="process-result-card" role="dialog" aria-modal="true" aria-labelledby="process-result-title" aria-describedby="process-result-description" aria-busy={saving} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}>
  <span className="process-result-check" aria-hidden="true">✓</span><h2 id="process-result-title">สร้างรูปสำเร็จแล้ว</h2>
  <p className="process-result-usage">{paid?'ใช้สิทธิ์ประมวลผล 1 ครั้ง':trial?'ใช้สิทธิ์ทดลองฟรี 1 ครั้ง':notice.kind==='reused'?'แสดงรูปที่เคยสร้างไว้ · ไม่ใช้สิทธิ์เพิ่ม':'รูปพร้อมแล้ว'}{typeof remaining==='number'&&(paid||trial)&&<strong>คงเหลือ {Math.max(0,remaining)} ครั้ง</strong>}</p>
  <div className={'process-result-storage '+(saved?'is-saved':notice.saveState==='error'?'is-error':'')} role="status" aria-live="polite"><strong>{saving?'กำลังบันทึกงานในบัญชี…':saved?'บันทึกงานในบัญชีสำเร็จแล้ว':trial?'รูปทดลองยังมีลายน้ำ':'ยังไม่ได้บันทึกงานในบัญชี'}</strong><p id="process-result-description">{saving?'กรุณารอผลยืนยันก่อนออกจากเว็บ':saved?'เปิดแก้ไขต่อจาก “งานของฉัน” ด้วยอีเมลเดิมได้ หากแก้ไขเพิ่มเติม กรุณาบันทึกงานล่าสุดอีกครั้ง':trial?'เลือกแพ็กเกจเพื่อรับรูปไม่มีลายน้ำ แล้วบันทึกงานหรือดาวน์โหลดเก็บไว้':notice.message||'กรุณาดาวน์โหลดเก็บไว้ในเครื่อง หรือกดบันทึกงานก่อนออกจากเว็บ'}</p></div>
  {paid&&<p className="process-result-note">สิทธิ์ใช้เมื่อสร้างรูปสำเร็จ แม้ยังไม่บันทึกหรือดาวน์โหลด การออกจากเว็บไม่คืนสิทธิ์ที่ใช้แล้ว</p>}
  <div className="process-result-actions"><button type="button" className="process-result-primary" onClick={onDownload}>{trial?'รับรูปไม่มีลายน้ำ':'ดาวน์โหลดรูป'}</button>{notice.canSave&&!saved&&<button type="button" disabled={saving} onClick={notice.limitReached?onManage:onSave}>{notice.limitReached?'จัดการงานที่บันทึก':'บันทึกงานอีกครั้ง'}</button>}<button type="button" className="process-result-continue" onClick={onClose}>{saving?'กลับไปดูรูป':'แก้ไขรูปต่อ'}</button></div>
 </section></div>;
}
