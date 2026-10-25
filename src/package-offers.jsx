import React from 'react';
import {ServiceTermsLink} from './service-terms.jsx';

function DownloadIcon(){return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 6v25m-9-9 9 9 9-9M9 32v9h30v-9" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function Check(){return <span className="ready-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m6 12 4 4 8-9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}

export function PackageOffers({payBusy,payMsg,hasTrial,creditBalance=0,onUseCredit,startCheckout,isAuthenticated=true,onAuthenticate}){
 const showMessage=payMsg&&!['สร้างและปรับแต่งฟรี','เลือกแพ็กเกจเพื่อ'].some(prefix=>payMsg.startsWith(prefix));
 return <div className="idprom-ready-offer">
  <style>{`
   .credit-modal-backdrop:has(.idprom-ready-offer){background:rgba(8,24,45,.8);backdrop-filter:blur(6px)}
   .package-pro-modal:has(.idprom-ready-offer){width:min(760px,calc(100vw - 28px));padding:38px 32px 24px;background:#fff;border:1px solid #dce4ee;border-radius:24px;box-shadow:0 28px 90px #020c2266;overflow:auto;max-height:calc(100dvh - 28px)}
   .package-pro-modal:has(.idprom-ready-offer)>.credit-modal-close{top:15px;right:18px;color:#617492;font-size:28px}
   .idprom-ready-offer{color:#0b2244;line-height:1.5;font-family:inherit}
   .idprom-ready-offer *{box-sizing:border-box}
   .idprom-ready-offer .ready-heading{text-align:center;padding:4px 12px 23px}
   .idprom-ready-offer .ready-heading h2{font:inherit;font-size:clamp(28px,3.8vw,42px);font-weight:800;line-height:1.35;margin:0 0 7px;color:#071d3d;letter-spacing:-.5px}
   .idprom-ready-offer .ready-heading p{margin:0;color:#617593;font-size:20px;font-weight:500}
   .idprom-ready-offer .ready-price-card{display:flex;align-items:center;justify-content:center;gap:32px;padding:24px;border-radius:20px;background:#eef7ff;margin-bottom:14px}
   .idprom-ready-offer .ready-download-emblem{width:104px;height:104px;flex:0 0 104px;border-radius:50%;display:grid;place-items:center;background:#dceeff;color:#0670df}
   .idprom-ready-offer .ready-download-emblem svg{width:60px;height:60px}
   .idprom-ready-offer .ready-price-divider{height:92px;width:1px;background:#b7d9fb;flex:0 0 1px}
   .idprom-ready-offer .ready-price-body{min-width:0}
   .idprom-ready-offer .ready-price{display:flex;align-items:baseline;gap:16px;color:#056bd7;white-space:nowrap;line-height:1.1;margin-bottom:14px}
   .idprom-ready-offer .ready-price strong{font-size:86px;font-weight:800;letter-spacing:-3px}
   .idprom-ready-offer .ready-price span{font-size:28px;font-weight:700}
   .idprom-ready-offer .ready-benefits{display:flex;gap:24px;flex-wrap:wrap;font-size:17px;font-weight:600}
   .idprom-ready-offer .ready-benefits>span{display:inline-flex;align-items:center;gap:10px}
   .idprom-ready-offer .ready-check{display:inline-grid;place-items:center;width:27px;height:27px;flex:0 0 27px;border-radius:50%;background:#076dd8;color:white}
   .idprom-ready-offer .ready-check svg{width:22px;height:22px}
   .idprom-ready-offer .ready-review{display:flex;align-items:center;gap:24px;padding:17px 28px;margin:0 0 16px;background:#eef5ff;border-radius:17px}
   .idprom-ready-offer .ready-review>svg{width:44px;height:44px;flex:0 0 44px}
   .idprom-ready-offer .ready-review strong{font-size:18px;font-weight:700;display:block}
   .idprom-ready-offer .ready-review p{font-size:17px;color:#617593;margin:0}
   .idprom-ready-offer .ready-warning{display:flex;align-items:center;gap:26px;padding:15px 29px;margin:0 0 14px;border-radius:16px;background:#fff2d8;color:#a65c08;font-size:17px;font-weight:600}
   .idprom-ready-offer .ready-warning svg{width:37px;height:37px;flex:0 0 37px}
   .idprom-ready-offer .ready-pay,.idprom-ready-offer .ready-use-credit{width:100%;border:0;border-radius:15px;background:#066cda;color:#fff;padding:17px 14px;font:inherit;font-size:21px;font-weight:700;cursor:pointer;min-height:64px}
   .idprom-ready-offer .ready-pay:hover:not(:disabled){background:#005fca}
   .idprom-ready-offer button:focus-visible{outline:3px solid #69b5ff;outline-offset:3px}
   .idprom-ready-offer .ready-pay:disabled,.idprom-ready-offer .ready-use-credit:disabled{opacity:.6;cursor:default}
   .idprom-ready-offer .ready-credit{padding:13px 16px;background:#f3f8fe;border:1px solid #cde2f8;border-radius:14px;margin:0 0 14px}
   .idprom-ready-offer .ready-credit p{margin:0 0 9px;text-align:center;font-size:15px;color:#476180}
   .idprom-ready-offer .ready-use-credit{background:#e0efff;color:#075fb9;font-size:16px;min-height:44px;padding:10px}
   .idprom-ready-offer .ready-message{font-size:15px;text-align:center;color:#a23d22;margin:12px 0 0}
   .idprom-ready-offer .ready-footer{text-align:center;color:#617593;font-size:16px;padding-top:16px}
   .idprom-ready-offer .ready-footer p{margin:0 0 10px}
   .idprom-ready-offer .ready-footer .idprom-terms-link-wrap{margin:0}
   .idprom-ready-offer .ready-footer .idprom-terms-link{font:inherit;color:#617593;text-decoration:underline;text-underline-offset:3px;background:transparent;border:0;padding:2px 0;cursor:pointer}
   @media(max-width:640px){
    .package-pro-modal:has(.idprom-ready-offer){padding:38px 18px 20px;border-radius:21px}
    .idprom-ready-offer .ready-heading{padding:0 0 19px}
    .idprom-ready-offer .ready-heading h2{font-size:27px;letter-spacing:-.3px}
    .idprom-ready-offer .ready-heading p{font-size:15px}
    .idprom-ready-offer .ready-price-card{gap:14px;padding:20px 14px;border-radius:16px}
    .idprom-ready-offer .ready-download-emblem{width:64px;height:64px;flex-basis:64px}
    .idprom-ready-offer .ready-download-emblem svg{width:39px;height:39px}
    .idprom-ready-offer .ready-price-divider{height:90px}
    .idprom-ready-offer .ready-price{gap:9px;margin-bottom:10px}
    .idprom-ready-offer .ready-price strong{font-size:57px;letter-spacing:-2px}
    .idprom-ready-offer .ready-price span{font-size:19px}
    .idprom-ready-offer .ready-benefits{gap:6px;font-size:13px;flex-direction:column}
    .idprom-ready-offer .ready-benefits>span{gap:7px}
    .idprom-ready-offer .ready-check{width:20px;height:20px;flex-basis:20px}
    .idprom-ready-offer .ready-check svg{width:17px;height:17px}
    .idprom-ready-offer .ready-review{gap:14px;padding:15px;margin-bottom:12px;border-radius:14px}
    .idprom-ready-offer .ready-review>svg{width:33px;height:33px;flex-basis:33px}
    .idprom-ready-offer .ready-review strong{font-size:15px}
    .idprom-ready-offer .ready-review p{font-size:14px}
    .idprom-ready-offer .ready-warning{gap:13px;padding:13px 15px;font-size:14px;border-radius:14px}
    .idprom-ready-offer .ready-warning svg{width:28px;height:28px;flex-basis:28px}
    .idprom-ready-offer .ready-pay{font-size:17px;padding:15px 9px;min-height:55px}
    .idprom-ready-offer .ready-footer{font-size:14px;padding-top:14px}
   }

   .package-pro-modal:has(.idprom-ready-offer){width:min(540px,calc(100vw - 32px));padding:30px 24px 20px;border-radius:20px;max-height:calc(100dvh - 32px)}
   .idprom-ready-offer .ready-heading{padding:0 18px 20px}
   .idprom-ready-offer .ready-heading h2{font-size:28px;letter-spacing:0}
   .idprom-ready-offer .ready-heading p{font-size:15px}
   .idprom-ready-offer .ready-price-card{gap:22px;padding:20px;border-radius:15px;margin-bottom:12px}
   .idprom-ready-offer .ready-download-emblem{width:64px;height:64px;flex-basis:64px}
   .idprom-ready-offer .ready-download-emblem svg{width:36px;height:36px}
   .idprom-ready-offer .ready-price-divider{height:68px}
   .idprom-ready-offer .ready-price{gap:10px;margin-bottom:10px}
   .idprom-ready-offer .ready-price strong{font-size:58px;letter-spacing:-1px}
   .idprom-ready-offer .ready-price span{font-size:19px}
   .idprom-ready-offer .ready-benefits{gap:12px;font-size:13px}
   .idprom-ready-offer .ready-benefits>span{gap:6px}
   .idprom-ready-offer .ready-check{width:19px;height:19px;flex-basis:19px}
   .idprom-ready-offer .ready-check svg{width:16px;height:16px}
   .idprom-ready-offer .ready-review{gap:14px;padding:14px 16px;border-radius:12px;margin-bottom:10px}
   .idprom-ready-offer .ready-review>svg{width:28px;height:28px;flex-basis:28px}
   .idprom-ready-offer .ready-review strong{font-size:15px}
   .idprom-ready-offer .ready-review p{font-size:13px;margin-top:3px}
   .idprom-ready-offer .ready-warning{gap:12px;padding:12px 16px;font-size:13px;font-weight:500;border-radius:12px;margin-bottom:12px}
   .idprom-ready-offer .ready-warning svg{width:25px;height:25px;flex-basis:25px}
   .idprom-ready-offer .ready-pay{min-height:48px;padding:12px 14px;border-radius:11px;font-size:16px}
   .idprom-ready-offer .ready-credit{padding:12px;border-radius:12px;margin-bottom:12px}
   .idprom-ready-offer .ready-credit p{font-size:13px}
   .idprom-ready-offer .ready-use-credit{font-size:14px;border-radius:9px}
   .idprom-ready-offer .ready-footer{font-size:12px;padding-top:14px}
   .idprom-ready-offer .ready-footer p{margin-bottom:6px}
   @media(max-width:640px){
    .package-pro-modal:has(.idprom-ready-offer){width:calc(100vw - 24px);padding:32px 18px 18px;border-radius:18px;max-height:calc(100dvh - 24px)}
    .idprom-ready-offer .ready-heading h2{font-size:24px}
    .idprom-ready-offer .ready-heading p{font-size:13px}
    .idprom-ready-offer .ready-price-card{padding:17px 12px;gap:14px}
    .idprom-ready-offer .ready-download-emblem{width:48px;height:48px;flex-basis:48px}
    .idprom-ready-offer .ready-download-emblem svg{width:29px;height:29px}
    .idprom-ready-offer .ready-price strong{font-size:48px}
    .idprom-ready-offer .ready-price span{font-size:17px}
    .idprom-ready-offer .ready-benefits{gap:5px;flex-direction:column;font-size:12px}
   }

  `}</style>
  <header className="ready-heading"><h2>รับรูปนี้ พร้อมใช้งาน</h2><p>ดาวน์โหลดรูปที่ปรับแต่งแล้ว ไม่มีลายน้ำ</p></header>
  <section className="ready-price-card" aria-label="ราคาและสิ่งที่จะได้รับ">
   <span className="ready-download-emblem"><DownloadIcon/></span><span className="ready-price-divider" aria-hidden="true"/>
   <div className="ready-price-body"><div style={{color:'#718097',fontSize:13,marginBottom:5}}>ราคาปกติ <del>199 บาท</del></div><div className="ready-price"><strong>119</strong><span>บาท / งาน</span></div><div className="ready-benefits"><span><Check/>รูปไม่มีลายน้ำ</span><span><Check/>พร้อมนำไปใช้งาน</span></div></div>
  </section>
  <div className="ready-review"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M4 24S11 10 24 10s20 14 20 14-7 14-20 14S4 24 4 24Z" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round"/><circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="3.2"/></svg><div><strong>ตรวจสอบภาพก่อนดาวน์โหลด</strong><p>ใบหน้า • ทรงผม • ชุด • พื้นหลัง</p></div></div>
  <div className="ready-warning"><DownloadIcon/><span>ตรวจสอบบราวเซอร์ที่สามารถดาวน์โหลดได้ ก่อนชำระเงิน</span></div>
  {isAuthenticated&&creditBalance>0&&<div className="ready-credit"><p>สิทธิ์ดาวน์โหลดคงเหลือ <strong>{creditBalance}</strong> งาน</p><button type="button" className="ready-use-credit" disabled={payBusy||!hasTrial} onClick={onUseCredit}>ใช้ 1 สิทธิ์ เพื่อรับรูปนี้</button></div>}
  {isAuthenticated?<button type="button" className="ready-pay" disabled={payBusy||!hasTrial} onClick={()=>startCheckout('119')}>{payBusy?'กำลังเตรียม…':'ชำระ 119 บาท เพื่อรับรูปนี้'}</button>:<div style={{display:'grid',gap:10}}><button type="button" className="ready-pay" disabled={payBusy||!hasTrial} onClick={()=>onAuthenticate('register')}>สมัครสมาชิก</button><button type="button" className="ready-pay" disabled={payBusy||!hasTrial} onClick={()=>onAuthenticate('login')}>เข้าสู่ระบบ</button></div>}
  {!hasTrial&&<p className="ready-message">กรุณาสร้างรูปให้สำเร็จก่อนรับรูป</p>}
  {showMessage&&<p role="status" className="ready-message">{payMsg}</p>}
  <footer className="ready-footer"><p>ชำระผ่าน PromptPay</p><ServiceTermsLink/></footer>
 </div>;
}




