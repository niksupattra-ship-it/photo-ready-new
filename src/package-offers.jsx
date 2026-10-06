import React from 'react';

export function PackageOffers({payBusy,payMsg,hasTrial,startCheckout}){
 return <>
  <header className="package-pro-head"><div className="package-pro-brand">IDพร้อม</div><h2 className="package-pro-title">เลือกแพ็กเกจ</h2><p className="package-pro-sub">เลือกรับรูปนี้ หรือสร้างภาพเพิ่ม</p></header>
  <div className="package-pro-grid">
   <article className="package-card">
    <h3 className="package-name">{hasTrial?'รับรูปนี้':'สร้าง 1 ครั้ง'}</h3>
    <div className="package-price">79 <small>บาท</small></div>
    <ul className="package-features">
     <li><strong>✓ {hasTrial?'รับรูปทดลองเดิมทันที':'เครดิตประมวลผล 1 ครั้ง'}</strong></li>
     <li>✓ ไม่มีลายน้ำ · ดาวน์โหลดได้</li>
     <li>✓ เปลี่ยนชุด / พื้นหลัง / ปรับแต่ง</li>
     <li>{hasTrial?'— เครดิตเหลือ 0 ครั้ง':'✓ เลือกทรงผมพร้อมสร้างรูป'}</li>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('79')}>{payBusy?'กำลังเปิด PromptPay…':'ซื้อ 79 บาท'}</button>
   </article>
   <article className="package-card popular">
    <span className="package-badge">แนะนำ</span>
    <h3 className="package-name">สร้าง 3 ครั้ง</h3>
    <div className="package-price">149 <small>บาท</small></div>
    <ul className="package-features">
     <li><strong>✓ {hasTrial?'รับรูปนี้ + สร้างเพิ่ม 2 ครั้ง':'เครดิตประมวลผล 3 ครั้ง'}</strong></li>
     <li>✓ ไม่มีลายน้ำ · ดาวน์โหลดได้</li>
     <li>✓ เปลี่ยนรูป / ทรงผมได้ทุกครั้ง</li>
     <li>✓ ปรับแต่งเต็มขณะมีเครดิต</li>
     {hasTrial&&<li>✓ รูปทดลองนับเป็นครั้งที่ 1</li>}
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('149')}>{payBusy?'กำลังเปิด PromptPay…':'ซื้อ 149 บาท'}</button>
   </article>
  </div>
  {payMsg&&<p className="credit-pay-msg">{payMsg}</p>}
  <div className="package-secure">รูปและทรงผมประมวลผลรวมเป็น 1 ครั้ง • ชำระผ่าน PromptPay</div>
 </>;
}
