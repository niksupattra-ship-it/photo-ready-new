import React from 'react';

function Feature({children,unavailable=false}){
 return <li><span className={'package-round-check'+(unavailable?' unavailable':'')} aria-hidden="true">{unavailable?'−':'✓'}</span><span>{children}</span></li>;
}
function PromptPaySymbol(){
 return <span className="package-promptpay-symbol" aria-label="PromptPay"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h2v2h-2zM17 17h2v2h-2z" fill="currentColor"/></svg><span>Prompt<span style={{color:'#168db7'}}>Pay</span></span></span>;
}
export function PackageOffers({payBusy,payMsg,hasTrial,startCheckout}){
 const showMessage=payMsg&&!payMsg.startsWith('เลือกแพ็กเกจเพื่อบันทึกและดาวน์โหลด');
 return <>
  <style>{`
   .package-pro-modal .package-features li{align-items:center;gap:12px;min-height:25px}
   .package-round-check{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 24px;border-radius:50%;background:#00aa83;color:white;font-size:18px;font-weight:900;line-height:1}
   .package-round-check.unavailable{background:#a7adb3}
   .package-trial-remaining{display:block;margin-top:3px;font-size:12px;color:#718097}
   .package-promptpay-footer{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
   .package-promptpay-symbol{display:inline-flex;align-items:center;gap:6px;color:#14395a;background:#fff;border:1px solid #dde5ed;border-radius:7px;padding:5px 8px;font-size:15px;font-weight:800;line-height:1}
  `}</style>
  <header className="package-pro-head"><div className="package-pro-brand">IDพร้อม</div><h2 className="package-pro-title">เลือกแพ็กเกจ</h2><p className="package-pro-sub">รับรูปที่ชอบ หรือซื้อเครดิตเพื่อสร้างภาพเพิ่ม</p></header>
  <div className="package-pro-grid">
   <article className="package-card">
    <div className="package-price">79 <small>บาท</small></div>
    <ul className="package-features">
     <Feature>{hasTrial?'ดาวน์โหลดรูปทดลอง (ไม่มีลายน้ำ)':'ดาวน์โหลดรูปได้ (ไม่มีลายน้ำ)'}</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง</Feature>
     {hasTrial&&<Feature>ใช้งานรูปเดิม</Feature>}
     {!hasTrial&&<Feature>เลือกทรงผมได้</Feature>}
     {!hasTrial&&<Feature>ปรับแต่งรูปเพิ่มเติมได้</Feature>}
     <Feature unavailable>ไม่มีเครดิตเพิ่ม</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('79')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 79 บาท'}</button>
   </article>
   <article className="package-card popular">
    <span className="package-badge">แนะนำ</span>
    <div className="package-price">149 <small>บาท</small></div>
    <ul className="package-features">
     <Feature>ดาวน์โหลดไม่จำกัด (ไม่มีลายน้ำ)</Feature>
     <Feature>เครดิตสร้างภาพ 3 ครั้ง{hasTrial&&<small className="package-trial-remaining">รวมรูปทดลองนี้ · เหลือ 2 ครั้ง</small>}</Feature>
     <Feature>เลือกทรงผมได้</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง</Feature>
     <Feature>ปรับแต่งรูปเพิ่มเติมได้</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('149')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 149 บาท'}</button>
   </article>
  </div>
  <p style={{margin:'16px 0 0',fontSize:13,lineHeight:1.65,color:'#66758c',textAlign:'center'}}><strong style={{color:'#243650'}}>รูปทดลองนับรวมในจำนวนครั้งของแพ็กเกจ</strong><br/>หากประมวลผลทดลองแล้ว 1 ครั้ง ซื้อแพ็ก 79 บาทจะเหลือ 0 ครั้ง และแพ็ก 149 บาทจะเหลือ 2 ครั้ง โดยรับรูปทดลองเดิมแบบไม่มีลายน้ำ</p>
  {showMessage&&<p className="credit-pay-msg">{payMsg}</p>}
  <div className="package-secure package-promptpay-footer"><PromptPaySymbol/><span>ชำระเงินผ่านพร้อมเพย์</span></div>
 </>;
}
