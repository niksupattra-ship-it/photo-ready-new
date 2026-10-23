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
 return <div className="process-result-overlay"><section ref={panel} tabIndex={-1} className="process-result-card" role="dialog" aria-modal="true" aria-labelledby="process-result-title" aria-describedby="process-result-description" aria-busy={saving} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const buttons=[...e.currentTarget.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}>
  <span className="process-result-check" aria-hidden="true">✓</span><h2 id="process-result-title">สร้างรูปสำเร็จแล้ว</h2>
  <p className="process-result-usage">{paid?'ใช้เครดิตประมวลผล 1 ครั้ง':trial?'ใช้เครดิตทดลองฟรี 1 ครั้ง':notice.kind==='reused'?'แสดงรูปที่เคยสร้างไว้ · ไม่ใช้เครดิตเพิ่ม':'รูปพร้อมแล้ว'}{typeof remaining==='number'&&(paid||trial)&&<strong>คงเหลือ {Math.max(0,remaining)} ครั้ง</strong>}</p>
  {saving?<p id="process-result-description" className="process-result-saving-note">กรุณารอให้บันทึกสำเร็จก่อนออกจากเว็บ</p>:<div className={'process-result-storage '+(saved?'is-saved':full||notice.saveState==='error'?'is-error':'')} role="status" aria-live="polite"><strong>{full?'บันทึกงานครบ 3 งานแล้ว':saved?'บันทึกงานสำเร็จแล้ว':trial?'รูปทดลองยังมีลายน้ำ':notice.saveState==='error'?'บันทึกงานไม่สำเร็จ':'ยังไม่ได้บันทึกงาน'}</strong><p id="process-result-description">{full?<>กรุณาลบงานเดิม 1 งาน<br/>แล้วกลับมาบันทึกงานนี้อีกครั้ง</>:saved?'เปิดแก้ไขต่อจาก “งานของฉัน” ด้วยอีเมลเดิมได้ หากแก้ไขเพิ่มเติม กรุณาบันทึกอีกครั้ง':trial?'เลือกแพ็กเกจเพื่อรับรูปไม่มีลายน้ำ แล้วบันทึกงานหรือดาวน์โหลดเก็บไว้':notice.message||'กรุณาบันทึกงานก่อนออกจากเว็บ'}</p></div>}
  {paid&&<p className="process-result-note">ใช้เครดิตแล้วเมื่อสร้างรูปสำเร็จ</p>}
  <div className="process-result-actions"><button type="button" className="process-result-primary" disabled={saving} onClick={trial?onDownload:saved?onClose:full?onManage:onSave}>{saving&&<span className="process-result-spinner" aria-hidden="true"/>}{trial?'รับรูปไม่มีลายน้ำ':saving?'กำลังบันทึกงาน…':saved?'บันทึกงานแล้ว · แก้ไขรูปต่อ':full?'จัดการงานที่บันทึก':'บันทึกงาน'}</button>{!saved&&<button type="button" className="process-result-continue" onClick={onClose}>{saving||full?'กลับไปดูรูป':'แก้ไขรูปต่อ'}</button>}</div>
 </section></div>;
}


