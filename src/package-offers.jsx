import React from 'react';
import {ServiceTermsLink} from './service-terms.jsx';
export function PackageOffers({payBusy,payMsg,hasTrial,creditBalance=0,onUseCredit,startCheckout,isAuthenticated=true,onAuthenticate}){
 const disabled=payBusy||!hasTrial;
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
 .paired-offers .offer-card.premium{background:linear-gradient(160deg,#fff2f7,#fff9fb);border-color:#eaa2bf;box-shadow:0 4px 16px #b82b6514}.paired-offers .offer-card{position:relative}.paired-offers .premium .offer-price,.paired-offers .premium .offer-check{color:#c62668}.paired-offers .premium .ready-pay{background:#cf286b}.paired-offers .premium>.offer-recommended{position:absolute;right:12px;top:-12px;margin:0;background:#cf286b;padding:4px 11px;font-size:12px}.paired-offers .offer-pair{padding-top:8px}
 .paired-offers .offer-recommended{display:inline-block;margin-left:7px;padding:3px 8px;border-radius:20px;background:#086bce;color:white;font-size:11px;font-weight:650;vertical-align:middle;white-space:nowrap}.paired-offers .offer-name{font-size:17px;font-weight:750;margin:0 0 7px;color:#175a9f}
 .paired-offers .offer-regular{height:22px;font-size:12px;color:#718097;margin:0}
 .paired-offers .offer-price{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;color:#086bce;margin:5px 0 18px}
 .paired-offers .offer-price strong{font-size:52px;line-height:1;font-weight:800}.paired-offers .offer-price span{font-size:14px}
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
 @media(max-width:640px){.package-pro-modal:has(.paired-offers){width:calc(100vw - 20px);padding:34px 12px 16px;border-radius:18px;max-height:calc(100dvh - 20px)}.paired-offers .ready-heading{padding:0 12px 16px}.paired-offers .ready-heading h2{font-size:23px}.paired-offers .ready-heading p{font-size:12px}.paired-offers .offer-pair{gap:8px}.paired-offers .offer-card{padding:16px 10px;border-radius:12px}.paired-offers .offer-name{font-size:15px}.paired-offers .offer-price{gap:4px;margin-bottom:16px}.paired-offers .offer-price strong{font-size:38px}.paired-offers .offer-price span{font-size:11px}.paired-offers .offer-features{font-size:12px;gap:10px}.paired-offers .ready-pay{font-size:13px;padding:11px 6px}.paired-offers .offer-regular{font-size:11px}.paired-offers .ready-review,.paired-offers .ready-warning{padding:11px 12px}}
 `}</style>
 <header className="ready-heading"><h2>รับรูปนี้ พร้อมใช้งาน</h2><p>เลือกโปรสำหรับงานนี้ · ดาวน์โหลดรูปไม่มีลายน้ำ</p></header>
 <div className="offer-pair">{[{price:'119',name:'โปร 119',premium:false,features:['ดาวน์โหลดรูปนี้/ปลดลายน้ำ','ลองชุด 3 ชุด','ทรงผมพื้นฐาน']},{price:'159',name:'💎 โปร 159',premium:true,features:['ดาวน์โหลดรูปนี้/ปลดลายน้ำ','ลองชุด 3 ชุด','ปลดล็อคทรงผม']}].map(o=><section key={o.price} className={'offer-card'+(o.premium?' premium':'')} aria-label={'โปร '+o.price+' บาท'}>{o.premium&&<span className="offer-recommended">แนะนำ</span>}<p className="offer-regular"><>ราคาปกติ <del>{o.premium?'249':'199'} บาท</del></></p><div className="offer-price"><strong>{o.price}</strong><span>บาท / งาน</span></div><ul className="offer-features">{o.features.map(f=><li key={f}><span className="offer-check" aria-hidden="true">✓</span><span>{f}{o.premium&&f==='ปลดล็อคทรงผม'&&<span aria-hidden="true"> 💎</span>}</span></li>)}</ul>{isAuthenticated&&<button type="button" className="ready-pay" disabled={disabled} onClick={()=>startCheckout(o.price)}>{payBusy?'กำลังเตรียม…':'เลือกโปร '+o.price+' บาท'}</button>}</section>)}</div>
 {!isAuthenticated&&<div className="offer-auth"><button type="button" className="ready-pay" disabled={disabled} onClick={()=>onAuthenticate('register')}>สมัครสมาชิก</button><button type="button" className="ready-pay" disabled={disabled} onClick={()=>onAuthenticate('login')}>เข้าสู่ระบบ</button></div>}
 
 <div className="ready-warning"><p>กรุณาตรวจสอบเบราว์เซอร์ที่สามารถดาวน์โหลดได้ และกรุณาปรับแต่งภาพให้พร้อมใช้งานก่อนชำระเงิน</p><p>เบราว์เซอร์ภายในแอป เช่น LINE, Facebook หรือ TikTok อาจดาวน์โหลดไม่ได้ แนะนำเปิดเว็บไซต์ผ่าน Safari หรือ Chrome โดยตรง</p></div>
 {isAuthenticated&&creditBalance>0&&<div className="ready-credit"><p>สิทธิ์ดาวน์โหลดคงเหลือ <strong>{creditBalance}</strong> งาน</p><button type="button" className="ready-use-credit" disabled={disabled} onClick={onUseCredit}>ใช้ 1 สิทธิ์ เพื่อรับรูปนี้</button></div>}
 {!hasTrial&&<p className="ready-message">กรุณาสร้างรูปให้สำเร็จก่อนรับรูป</p>}
 {showMessage&&<p role="status" className="ready-message">{payMsg}</p>}
 <footer className="ready-footer"><p>ชำระผ่าน PromptPay</p><ServiceTermsLink/></footer>
 </div>;
}




