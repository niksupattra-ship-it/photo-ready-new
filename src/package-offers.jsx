import React from 'react';

export function PackageOffers({payBusy,payMsg,hasTrial,startCheckout}){
 return <>
  <header className="package-pro-head"><div className="package-pro-brand">IDพร้อม</div><h2 className="package-pro-title">เลือกแพ็กเกจ</h2><p className="package-pro-sub">รับรูปที่ชอบ หรือซื้อเครดิตเพื่อสร้างภาพเพิ่ม</p></header>
  <div className="package-pro-grid">
   <article className="package-card">
    <h3 className="package-name">รับรูปนี้</h3>
    <div className="package-price">79 <small>บาท</small></div>
    <ul className="package-features">
     <li>✓ ดาวน์โหลดรูปทดลอง ไม่มีลายน้ำ</li>
     <li>✓ เปลี่ยนชุด / พื้นหลัง / ปรับแต่งรูปที่ซื้อ</li>
     <li>✓ ใช้ทรงผมในรูปทดลองเดิม</li>
     <li>— ไม่มีเครดิตประมวลผลเพิ่มเติม</li>
     <li>— ไม่มีสิทธิ์เปลี่ยนรูปเพื่อสร้างใหม่</li>
    </ul>
    <button className="package-select-btn" disabled={payBusy||!hasTrial} onClick={()=>startCheckout('79')}>{payBusy?'กำลังเปิด PromptPay…':'รับรูปนี้ 79 บาท'}</button>
    {!hasTrial&&<p style={{fontSize:12,color:'#64758b'}}>ทดลองสร้างรูปก่อน เพื่อเลือกรับรูปนั้น</p>}
   </article>
   <article className="package-card popular">
    <span className="package-badge">แนะนำ</span>
    <h3 className="package-name">สร้างได้ 3 ครั้ง</h3>
    <div className="package-price">149 <small>บาท</small></div>
    <ul className="package-features">
     <li>✓ ดาวน์โหลดรูปทดลอง ไม่มีลายน้ำ</li>
     <li>✓ เครดิตประมวลผลเพิ่มเติม 3 ครั้ง</li>
     <li>✓ เปลี่ยนรูปต้นฉบับได้ทุกครั้ง</li>
     <li>✓ เลือกทรงผมพร้อมประมวลผล</li>
     <li>✓ เปลี่ยนชุด / พื้นหลัง / ปรับแต่งเต็มขณะมีเครดิต</li>
     <li>✓ รูปและทรงผมใช้เครดิตรวม 3 ครั้ง</li>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('149')}>{payBusy?'กำลังเปิด PromptPay…':'สร้างได้ 3 ครั้ง 149 บาท'}</button>
   </article>
  </div>
  {payMsg&&<p className="credit-pay-msg">{payMsg}</p>}
  <div className="package-secure">ชำระเงินผ่าน Stripe • รองรับ PromptPay • สิทธิ์เพิ่มหลังยืนยันการชำระเงิน</div>
 </>;
}
