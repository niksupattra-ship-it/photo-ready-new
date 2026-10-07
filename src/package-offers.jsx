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
   @media(min-width:641px) and (max-height:800px){
    .package-pro-modal{padding:22px;overflow-x:hidden}
    .package-pro-head{padding-bottom:14px}
    .package-card{padding:20px}
    .package-price{margin-bottom:14px}
    .package-features{gap:10px;margin-bottom:18px!important}
    .package-trial-note{margin-top:12px!important;line-height:1.5!important}
    .package-secure{margin-top:12px;padding:10px 14px}
   }
   @media(min-width:641px) and (max-height:650px){
    .package-pro-modal{padding:16px}
    .package-pro-head{padding-bottom:10px}
    .package-pro-brand{font-size:16px;margin-bottom:3px}
    .package-pro-title{font-size:26px!important}
    .package-pro-sub{font-size:13px}
    .package-card{padding:16px}
    .package-pro-modal .package-original-price{font-size:17px}
    .package-price{font-size:34px;margin:5px 0 10px}
    .package-features{gap:6px;margin-bottom:12px!important}
    .package-pro-modal .package-features li{font-size:13px}
    .package-select-btn{padding:11px 14px}
    .package-trial-note{margin-top:10px!important;font-size:12px!important}
    .package-secure{margin-top:10px;padding:8px 12px}
   }
   .package-original-price{color:#dc2626;font-size:20px;font-weight:700;margin-bottom:4px}
   .package-original-price del{text-decoration-color:#dc2626;text-decoration-thickness:2px}
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
    <div className="package-original-price"><del>149 บาท</del></div>
    <div className="package-price">89 <small>บาท</small></div>
    <ul className="package-features">
     <Feature>รับรูปที่ทดลอง (ไม่มีลายน้ำ)</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง ได้ทุกแบบ</Feature>
     <Feature>ใช้เครื่องมือปรับแต่งรูป</Feature>
     <Feature>บันทึกงานไว้แก้ไขภายหลัง</Feature>
     <Feature>ดาวน์โหลดไม่จำกัด</Feature>
     <Feature unavailable>ไม่มีเครดิตเพิ่ม</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('89')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 89 บาท'}</button>
   </article>
   <article className="package-card popular">
    <span className="package-badge">แนะนำ</span>
    <div className="package-original-price"><del>199 บาท</del></div>
    <div className="package-price">159 <small>บาท</small></div>
    <ul className="package-features">
     <Feature>เครดิตประมวลผลรูป 3 ครั้ง</Feature>
     <Feature>เปลี่ยนทรงผมได้ (ตามจำนวนเครดิต)</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง ได้ทุกแบบ</Feature>
     <Feature>ใช้เครื่องมือปรับแต่งรูป</Feature>
     <Feature>บันทึกงานไว้แก้ไขภายหลัง</Feature>
     <Feature>ดาวน์โหลดไม่จำกัด</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('159')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 159 บาท'}</button>
   </article>
  </div>
  <p className="package-trial-note" style={{margin:'16px 0 0',fontSize:13,lineHeight:1.65,color:'#66758c',textAlign:'center'}}><strong style={{color:'#243650'}}>รูปทดลองนับรวมในจำนวนครั้งของแพ็กเกจ</strong><br/>หากประมวลผลทดลองแล้ว 1 ครั้ง ซื้อแพ็ก 89 บาทจะเหลือ 0 ครั้ง และแพ็ก 159 บาท จะเหลือ 2 ครั้ง โดยรับรูปทดลองเดิมแบบไม่มีลายน้ำ</p>
  {showMessage&&<p className="credit-pay-msg">{payMsg}</p>}
  <div className="package-secure package-promptpay-footer"><PromptPaySymbol/><span>ชำระเงินผ่านพร้อมเพย์</span></div>
 </>;
}
