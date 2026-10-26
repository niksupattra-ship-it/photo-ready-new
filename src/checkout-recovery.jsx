import React from 'react';
import './checkout-recovery.css';

export function CheckoutRecovery({payment,busy,message,onResume}){
 const paid=['succeeded','work_unlocked'].includes(payment.status);
 return <section className="checkout-recovery" aria-label="ทำงานเดิมต่อ" aria-busy={busy}>
  <div><strong>{paid?'งานที่ชำระแล้วของคุณ':'ทำงานเดิมต่อ'}</strong><p>{paid?'เปิดรูปเดิมเพื่อดาวน์โหลด โดยไม่ต้องประมวลผลหรือชำระเงินใหม่':'เปิดรูปเดิมและตรวจสอบรายการชำระเงินที่ค้างไว้'}</p>{message&&<p className="checkout-recovery-error" role="status">{message}</p>}</div>
  <button type="button" disabled={busy} onClick={onResume}>{busy?'กำลังเปิดงานเดิม…':'เปิดงานเดิมและตรวจสอบการชำระเงิน'}</button>
 </section>;
}
