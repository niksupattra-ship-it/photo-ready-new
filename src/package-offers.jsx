import {ServiceTermsLink} from './service-terms.jsx';
import React from 'react';
import {PackageGuideArt,PackageGuideNotice,PackageGuideClock} from './package-guide-art.jsx';
import './package-guidance.css';

function Feature({children,unavailable=false,credit=false}){
 return <li>{credit?<svg width="24" height="22" viewBox="0 0 24 22" fill="none" aria-hidden="true" style={{flex:'0 0 24px'}}><path d="M2 7 7 1.5h10L22 7 12 20.5Z" fill="#42bfd9" stroke="#249dbb" strokeWidth=".8"/><path d="m7 1.5 5 5.5 5-5.5M2 7h20M7 1.5l5 19 5-19" stroke="#c7f3fa" strokeWidth=".7"/></svg>:<span className={'package-round-check'+(unavailable?' unavailable':'')} aria-hidden="true">{unavailable?'−':'✓'}</span>}<span>{children}</span></li>;
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
  <header className="package-pro-head"><h2 className="package-pro-title">เลือกแพ็กเกจ</h2></header>
  <div className="package-pro-grid">
   <article className="package-card">
    <div className="package-original-price"><del>149 บาท</del></div>
    <div className="package-price">89 <small>บาท</small></div>
    <ul className="package-features">
     <Feature credit>2 เครดิต</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง ได้ทุกแบบ</Feature>
     <Feature>ใช้เครื่องมือปรับแต่งรูป</Feature>
     <Feature>บันทึกงานในบัญชีได้สูงสุด 3 งาน (หมดอายุ 45 วัน)</Feature>
     <Feature>ดาวน์โหลดรูปได้ทุกขนาด 1″ 1.5″ 2″ 2.5″<br/>หรือไฟล์ความละเอียดสูง 2256 × 3072 px</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('89')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 89 บาท'}</button>
   </article>
   <article className="package-card popular">
    <span className="package-badge">แนะนำ</span>
    <div className="package-original-price"><del>199 บาท</del></div>
    <div className="package-price">159 <small>บาท</small></div>
    <ul className="package-features">
     <Feature credit>10 เครดิต</Feature>
     <Feature>เปลี่ยนชุด / พื้นหลัง ได้ทุกแบบ</Feature>
     <Feature>ใช้เครื่องมือปรับแต่งรูป</Feature>
     <Feature>บันทึกงานในบัญชีได้สูงสุด 3 งาน (หมดอายุ 45 วัน)</Feature>
     <Feature>ดาวน์โหลดรูปได้ทุกขนาด 1″ 1.5″ 2″ 2.5″<br/>หรือไฟล์ความละเอียดสูง 2256 × 3072 px</Feature>
    </ul>
    <button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('159')}>{payBusy?'กำลังเปิด PromptPay…':'เลือก 159 บาท'}</button>
   </article>
  </div>
  <section className="package-guidance" aria-label="ข้อมูลเครดิตและการเก็บงาน">
   <article className="package-guidance-card package-guidance-credit-card">
    <div className="package-guidance-card-main"><PackageGuideArt kind="credit"/><div className="package-guidance-copy"><h3>การใช้เครดิต</h3><p>สร้างภาพ <b>1 ครั้ง</b> แสดงผลบนพื้นที่ทำงานสำเร็จ = <strong className="package-guidance-credit">ใช้ 1 เครดิต</strong></p></div></div>
    <div className="package-guidance-callout"><PackageGuideNotice/><p>(ไม่ใช่การดาวน์โหลดแล้วหักเครดิต)</p></div>
   </article>
   <article className="package-guidance-card package-guidance-save-card">
    <div className="package-guidance-card-main"><PackageGuideArt kind="save"/><div className="package-guidance-copy"><h3>การเก็บงาน</h3><p>กรุณาบันทึกหรือดาวน์โหลดรูป ก่อนออกจากหน้า Studio</p></div></div>
    <div className="package-guidance-callout"><PackageGuideNotice warning/><p>หากไม่บันทึกหรือดาวน์โหลดภาพไว้บนอุปกรณ์ของท่าน งานเดิมจะหายและจะเรียกเครดิตคืนหรือเงินคืนไม่ได้ งานที่บันทึกมีอายุ 45 วันหลังจากบันทึกครั้งแรก</p></div>
   </article>
  </section>
  <div className="package-guidance-trial"><div className="package-guidance-trial-title"><PackageGuideArt kind="gift"/><strong>ทดลองฟรีวันละ 2 ครั้งพร้อมลายน้ำ</strong></div><div className="package-guidance-trial-condition"><PackageGuideClock/><span>เมื่อซื้อแพ็กเกจ เครดิตทดลองที่เหลือของวันนั้นจะสิ้นสุด</span></div></div>
  {showMessage&&<p className="credit-pay-msg">{payMsg}</p>}
  <footer className="package-offer-footer package-guidance-footer"><ServiceTermsLink/><div className="package-secure package-promptpay-footer"><PromptPaySymbol/><span>ชำระเงินผ่านพร้อมเพย์</span></div></footer>
 </>;
}






