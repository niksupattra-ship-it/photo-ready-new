import React from 'react';
import {ServiceTermsLink} from './service-terms.jsx';
function OfferDiamond(){return <svg className="offer-diamond" viewBox="0 0 24 22" aria-hidden="true" focusable="false"><path d="M2 7 7 1.5h10L22 7 12 20.5Z" fill="#42bfd9" stroke="#249dbb" strokeWidth=".8" strokeLinejoin="round"/><path d="m7 1.5 5 5.5 5-5.5M2 7h20M7 1.5l5 19 5-19" fill="none" stroke="#c7f3fa" strokeWidth=".7" strokeLinejoin="round"/><path d="M3 6.5 7.1 2h2L6.6 6.5Z" fill="#e8fbff"/></svg>}
export function PackageOffers({payBusy,payMsg,hasTrial,creditBalance=0,premiumCreditBalance=0,onUseCredit,startCheckout,isAuthenticated=true,onAuthenticate,onOpenCode}){
 const disabled=payBusy||!hasTrial;
 const premiumCredits=Math.max(0,Math.floor(Number(premiumCreditBalance)||0)),credits=Math.max(0,Math.floor(Number(creditBalance)||0))+premiumCredits;
 const usePremium=isAuthenticated&&premiumCredits>0;
 const showMessage=payMsg&&!['สร้างและปรับแต่งฟรี','เลือกแพ็กเกจเพื่อ'].some(p=>payMsg.startsWith(p));
 return <div className="idprom-ready-offer paired-offers">
 <style>{`
 .credit-modal-backdrop:has(.paired-offers){background:#08182dcc;backdrop-filter:blur(5px)}
 .package-pro-modal:has(.paired-offers){width:min(740px,calc(100vw - 28px));padding:32px 24px 20px;background:#fff;border:1px solid #dce4ee;border-radius:22px;max-height:calc(100dvh - 28px);overflow:auto;box-sizing:border-box}
 .package-pro-modal:has(.paired-offers)>.credit-modal-close{top:12px;right:14px;color:#718097}
 .paired-offers{font-family:inherit;color:#12284e;line-height:1.55}.paired-offers *{box-sizing:border-box}
 .paired-offers .ready-heading{text-align:center;padding:0 20px 22px}
 .paired-offers .ready-heading h2{font:inherit;font-size:28px;font-weight:800;line-height:1.4;margin:0 0 6px}
 .paired-offers .ready-heading p{margin:0;font-size:14px;color:#718097}
 .paired-offers .offer-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
 .paired-offers .offer-card{min-width:0;display:flex;flex-direction:column;padding:22px 18px;border:1px solid #dce7f3;border-radius:16px;background:#f7fbff}
 .paired-offers .offer-card.premium{background:linear-gradient(160deg,#fff2f7,#fff9fb);border-color:#eaa2bf;box-shadow:0 4px 16px #b82b6514}.paired-offers .offer-card{position:relative}.paired-offers .premium .offer-name,.paired-offers .premium .offer-price,.paired-offers .premium .offer-check{color:#c62668}.paired-offers .premium .ready-pay{background:#cf286b}.paired-offers .premium>.offer-recommended{position:absolute;right:12px;top:-12px;margin:0;background:#cf286b;padding:4px 11px;font-size:12px}.paired-offers .offer-pair{padding-top:8px}
 .paired-offers .offer-recommended{display:inline-block;margin-left:7px;padding:3px 8px;border-radius:20px;background:#086bce;color:white;font-size:11px;font-weight:650;vertical-align:middle;white-space:nowrap}.paired-offers .offer-name{display:flex;align-items:center;gap:7px;font-size:17px;font-weight:750;margin:0 0 7px;color:#175a9f}.paired-offers .offer-diamond{display:inline-block;width:22px;height:20px;flex:0 0 22px;vertical-align:middle}.paired-offers .offer-feature-label{display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px}
 .paired-offers .offer-regular{height:22px;font-size:12px;color:#718097;margin:0}
 .paired-offers .offer-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;color:#086bce;margin:5px 0 18px}
 .paired-offers .offer-price strong{font-size:52px;line-height:1;font-weight:800}.paired-offers .offer-price span{font-size:24px;font-weight:700}
 .paired-offers .offer-features{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:11px;font-size:14px;flex:1}
 .paired-offers .offer-features li{display:flex;gap:8px;align-items:flex-start}.paired-offers .offer-check{color:#0873d5;font-weight:800;flex:0 0 14px}
 .paired-offers button{font:inherit;cursor:pointer}
 .paired-offers .ready-pay,.paired-offers .ready-use-credit{width:100%;padding:12px 9px;border:0;border-radius:10px;background:#096bcf;color:#fff;font-weight:700;font-size:15px;min-height:46px}
 .paired-offers .offer-card:not(.premium) .ready-pay{background:#e0edfc;color:#175a9f}
 .paired-offers button:disabled{opacity:.5;cursor:default}.paired-offers button:focus-visible{outline:2px solid #2984dd;outline-offset:3px}
 .paired-offers .offer-auth{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
 .paired-offers .offer-auth button:last-child{background:#e9f2fc;color:#175a9f}
 .paired-offers .ready-review{background:#f0f5fb;border-radius:11px;padding:12px 16px;margin-bottom:10px;font-size:14px}.paired-offers .ready-review p{margin:2px 0 0;color:#718097;font-size:13px}
 .paired-offers .ready-warning{background:#fff4df;color:#95611d;border-radius:11px;padding:12px 16px;font-size:13px;margin-bottom:12px}
 .paired-offers .ready-warning p{margin:0}.paired-offers .ready-warning p+p{margin-top:7px}
 .paired-offers .ready-credit{padding:12px;border:1px solid #dce7f3;border-radius:11px;margin-bottom:12px;text-align:center}
 .paired-offers .ready-credit p{font-size:13px;margin:0 0 8px}.paired-offers .ready-use-credit{background:#e5f1ff;color:#175a9f;font-size:14px}
 .paired-offers .ready-footer{text-align:center;color:#718097;font-size:12px;padding-top:12px}.paired-offers .ready-footer p{margin:0 0 6px}
 .paired-offers .ready-footer .idprom-terms-link-wrap{margin:0}.paired-offers .ready-footer .idprom-terms-link{font:inherit;color:inherit;background:transparent;border:0;text-decoration:underline}
 .paired-offers .ready-message{text-align:center;font-size:13px;color:#a53e24}
 @media(max-width:640px){.package-pro-modal:has(.paired-offers){width:calc(100vw - 20px);padding:34px 12px 16px;border-radius:18px;max-height:calc(100dvh - 20px)}.paired-offers .ready-heading{padding:0 12px 16px}.paired-offers .ready-heading h2{font-size:23px}.paired-offers .ready-heading p{font-size:12px}.paired-offers .offer-pair{gap:8px}.paired-offers .offer-card{padding:16px 10px;border-radius:12px}.paired-offers .offer-name{font-size:15px}.paired-offers .offer-price{gap:4px;margin-bottom:16px}.paired-offers .offer-price strong{font-size:38px}.paired-offers .offer-price span{font-size:20px}.paired-offers .offer-features{font-size:12px;gap:10px}.paired-offers .ready-pay{font-size:13px;padding:11px 6px}.paired-offers .offer-regular{font-size:11px}.paired-offers .ready-review,.paired-offers .ready-warning{padding:11px 12px}}

 .paired-offers .ready-warning{padding:17px 18px;border:1px solid #f4d8a4;background:#fff7e8;border-radius:14px;color:#784b15;font-size:13px;line-height:1.65}
 .paired-offers .ready-warning-title{display:flex;align-items:center;gap:9px;margin-bottom:13px;color:#825014;font-size:15px}
 .paired-offers .ready-warning-title>span{display:grid;place-items:center;width:23px;height:23px;flex:0 0 23px;border:1.5px solid #c88b36;border-radius:50%;font:700 15px Georgia,serif}
 .paired-offers .ready-warning-items{display:grid;grid-template-columns:1fr 1fr;gap:16px}
 .paired-offers .ready-warning-item{display:flex;align-items:flex-start;gap:9px;min-width:0}
 .paired-offers .ready-warning-number{display:grid;place-items:center;flex:0 0 23px;height:23px;border-radius:7px;background:#f8e7c7;color:#875515;font-size:12px;font-weight:750;margin-top:1px}
 .paired-offers .ready-warning-item p{margin:0}.paired-offers .ready-warning-item p strong,.paired-offers .ready-warning-item p span{display:block}
 .paired-offers .ready-warning-item p span{margin-top:3px;color:#856848;font-size:12px}
 .paired-offers .ready-warning .ready-browser-note{margin:14px 0 0;padding-top:11px;border-top:1px solid #efd9b3;font-size:12px;color:#8c6230}
 .paired-offers .ready-payment-brand{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 13px}
 .paired-offers .ready-payment-brand img{display:block;width:104px;height:35px;object-fit:contain}
 @media(max-width:640px){.paired-offers .ready-warning{padding:15px 13px}.paired-offers .ready-warning-items{grid-template-columns:1fr;gap:12px}.paired-offers .ready-warning-title{font-size:14px;margin-bottom:12px}}

 .paired-offers .ready-warning{padding:10px 12px;border-color:#f2e5cf;background:#fffaf2;border-radius:10px;font-size:12px;line-height:1.5;color:#826444;margin-bottom:10px}
 .paired-offers .ready-warning-title{font-size:12px;gap:0;margin-bottom:5px;color:#826444}
 .paired-offers .ready-warning-title>span,.paired-offers .ready-warning-number{display:none}
 .paired-offers .ready-warning-items{display:block}
 .paired-offers .ready-warning-item{display:block}
 .paired-offers .ready-warning-item+.ready-warning-item{margin-top:4px}
 .paired-offers .ready-warning-item p strong,.paired-offers .ready-warning-item p span{display:inline;font-size:12px}
 .paired-offers .ready-warning-item p strong{font-weight:600}
 .paired-offers .ready-warning-item p span{margin:0 0 0 5px;color:#89735b}
 .paired-offers .ready-warning .ready-browser-note{margin:6px 0 0;padding-top:6px;border-color:#eee2cf;font-size:11px;color:#89735b}
 @media(max-width:640px){.paired-offers .ready-warning{padding:9px 11px}.paired-offers .ready-warning-title{font-size:12px;margin-bottom:4px}.paired-offers .ready-warning-item p strong,.paired-offers .ready-warning-item p span{font-size:12px}}
 @media(max-width:640px){.paired-offers .offer-pair{grid-template-columns:minmax(0,1fr);gap:18px}}

 .paired-offers .ready-prepay-note{margin:0 0 12px;padding:14px;border:1px solid #ffca91;border-radius:14px;background:linear-gradient(120deg,#fffbf6,#fff8ef);color:#53483e;line-height:1.65}
 .paired-offers .ready-prepay-main{display:flex;align-items:center;gap:16px;padding:1px 3px 12px}
 .paired-offers .ready-prepay-icon{display:grid;place-items:center;flex:0 0 56px;height:56px;border-radius:50%;background:#ffe8cc;color:#ee8405}
 .paired-offers .ready-prepay-icon svg{width:31px;height:31px}
 .paired-offers .ready-prepay-copy{min-width:0;flex:1}
 .paired-offers .ready-prepay-copy h3{margin:0 0 5px;color:#5c310d;font-size:17px;line-height:1.4;font-weight:750}
 .paired-offers .ready-prepay-copy p{margin:3px 0 0;font-size:12px}
 .paired-offers .ready-prepay-copy strong{color:#795020;font-weight:700}
 .paired-offers .ready-prepay-caution{display:flex;align-items:center;gap:9px;margin:0;padding:8px 11px;border-radius:10px;background:#ffecd6;color:#70502d;font-size:12px}
 .paired-offers .ready-prepay-caution>span:first-child{display:grid;place-items:center;flex:0 0 20px;height:20px;border-radius:50%;background:#ed870d;color:#fff;font-size:15px;font-weight:800}
 .paired-offers .ready-prepay-caution strong{color:#d56f00}
 @media(max-width:640px){.paired-offers .ready-prepay-note{padding:11px;border-radius:12px}.paired-offers .ready-prepay-main{align-items:flex-start;gap:10px;padding:1px 0 10px}.paired-offers .ready-prepay-icon{flex-basis:36px;height:36px}.paired-offers .ready-prepay-icon svg{width:23px;height:23px}.paired-offers .ready-prepay-copy h3{font-size:15px;margin-bottom:6px}.paired-offers .ready-prepay-copy p{margin-top:5px}.paired-offers .ready-prepay-caution{align-items:flex-start;padding:8px 9px;font-size:11px;gap:7px}.paired-offers .ready-prepay-caution>span:first-child{flex-basis:18px;height:18px;font-size:13px;margin-top:1px}}
 `}</style>
 <header className="ready-heading"><h2>รูปของคุณพร้อมแล้ว!</h2><p>เลือกแพ็กเกจเพื่อรับรูปนี้แบบไม่มีลายน้ำ พร้อมดาวน์โหลดลงอุปกรณ์</p></header>
 {onOpenCode&&<div className="ready-code"><button type="button" disabled={payBusy} onClick={onOpenCode}>ใส่โค้ด</button></div>}
 <div className="offer-pair">{[{price:'89',regular:'159',name:'รับรูปนี้',premium:false,features:['ปลดลายน้ำ','เลือกชุดได้ 3 ชุด','ทรงผมพื้นฐาน']},{price:'159',regular:'199',name:'รับรูป + ทรงผม',premium:true,features:['ปลดลายน้ำ','เลือกชุดได้ 5 ชุด','ปลดล็อกทรงผม']}].map(o=><section key={o.price} className={'offer-card'+(o.premium?' premium':'')} aria-label={o.name+' '+o.price+' บาท'}><h3 className="offer-name">{o.premium&&<OfferDiamond/>}{o.name}</h3><p className="offer-regular">จาก <del>{o.regular} ฿</del></p><div className="offer-price"><strong>{o.price}</strong><span>฿</span></div><ul className="offer-features">{o.features.map(f=><li key={f}><span className="offer-check" aria-hidden="true">✓</span><span className="offer-feature-label">{f}{o.premium&&f==='ปลดล็อกทรงผม'&&<OfferDiamond/>}</span></li>)}</ul>{<button type="button" className="ready-pay" disabled={disabled} onClick={()=>o.premium&&usePremium?onUseCredit({premium:true}):startCheckout(o.price)}>{payBusy?'กำลังเตรียม…':o.premium&&usePremium?'ใช้ 1 สิทธิ์โปร 159':'เลือกโปร '+o.price+' บาท'}</button>}</section>)}</div>

 
 <aside className="ready-prepay-note" aria-label="ข้อควรตรวจสอบก่อนชำระเงิน"><div className="ready-prepay-main"><div className="ready-prepay-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M16 4v16m-6-6 6 6 6-6M6 23v4h20v-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></div><div className="ready-prepay-copy"><h3>ก่อนชำระเงิน เช็กให้พร้อม</h3><p><strong>ตรวจสอบเบราว์เซอร์ที่ดาวน์โหลดได้</strong> แนะนำเปิดเว็บไซต์ผ่าน Safari หรือ Chrome โดยตรง</p><p><strong>ปรับแต่งภาพให้พร้อมใช้งาน</strong> ตรวจสอบใบหน้า ทรงผม ชุด และพื้นหลังให้เรียบร้อยก่อนชำระเงิน</p></div></div><p className="ready-prepay-caution"><span aria-hidden="true">!</span><span><strong>ข้อควรระวัง:</strong> เบราว์เซอร์ภายในแอป LINE, Facebook หรือ TikTok อาจดาวน์โหลดไม่ได้</span></p></aside>
 {isAuthenticated&&credits>0&&<div className="ready-credit"><p>สิทธิ์ดาวน์โหลดคงเหลือ <strong>{credits}</strong> งาน{premiumCredits>0&&<> · โปร 159 จำนวน <strong>{premiumCredits}</strong> งาน</>}</p><button type="button" className="ready-use-credit" disabled={disabled} onClick={()=>onUseCredit({premium:usePremium})}>{usePremium?'ใช้ 1 สิทธิ์โปร 159 เพื่อรับรูป + ทรงผม':'ใช้ 1 สิทธิ์ เพื่อรับรูปนี้'}</button></div>}
 {!hasTrial&&<p className="ready-message">กรุณาสร้างรูปให้สำเร็จก่อนรับรูป</p>}
 {showMessage&&<p role="status" className="ready-message">{payMsg}</p>}
 <footer className="ready-footer"><div className="ready-payment-brand"><span>ชำระผ่าน</span><img src="/assets/payment/promptpay-logo.png" alt="พร้อมเพย์ PromptPay" width="104" height="35"/></div><ServiceTermsLink/></footer>
 </div>;
}









