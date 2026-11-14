import {englishPreviewEnabled} from './english-preview.js';
import React,{useState} from 'react';
import './package-offers.css';
import {ServiceTermsLink} from './service-terms.jsx';

function OfferDiamond(){return <svg className="offer-diamond" viewBox="0 0 40 34" aria-hidden="true" focusable="false"><path d="M2 11 10 2h20l8 9-18 21Z" fill="#58bdf1" stroke="#329bd3" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 11h36L20 32Z" fill="#299ddd"/><path d="m10 2 5 9h10l5-9Z" fill="#c3f2ff"/><path d="m15 11 5 21 5-21Z" fill="#87dbfa"/><path d="M2 11 10 2l5 9Zm23 0 5-9 8 9Z" fill="#6ed0f5"/><path d="m6 9 5-5h4" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>}

const OFFERS=[
 {price:'89',name:'รับรูปนี้',features:'เลือกชุด 3 ชุด · ทรงผมพื้นฐาน'},
 {price:'159',name:'รับรูปนี้ + ทรงผม',features:'เลือกชุด 5 ชุด · ปลดล็อกทรงผม'}
];
function EnglishOffers({preview,payBusy,payMsg,hasTrial,startCheckout,onBackToPhoto,premiumState={}}){
 const ready=Boolean(hasTrial)&&!payBusy;
 const premiumRunning=Boolean(premiumState.usdPremiumActive&&Number(premiumState.usdPremiumRemaining)>0);
 const plans=[
  {id:'usd_single_690_v2',name:'Single Image',price:'$6.90',period:'',button:'Download This Photo',
   features:['Download 1 selected photo','PNG & PDF downloads','No watermark']},
  {id:'usd_premium_1490_v2',name:'Premium',price:'$14.90',period:'30-day access',button:'Choose Premium',
   features:['All outfits & hairstyles','20 AI generations','Unlimited manual editing','PNG & PDF downloads','Download all your creations','No watermarks']}
 ];
 return <div className="en-plans" aria-label="English photo packages">
  <header className="en-plans-heading">
   <span className="en-plans-eyebrow">IDPROM STUDIO</span>
   <h2>Choose Your Plan</h2>
  </header>
  {premiumState.usdPremiumPurchased&&<div className="en-plans-balance" role="status"><span>{premiumState.usdPremiumActive?'Premium active':'Premium access ended'}</span><strong>{premiumState.usdPremiumRemaining||0} / 20 AI generations left</strong>{premiumState.usdPremiumUntil&&<small>Access until {new Date(premiumState.usdPremiumUntil).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</small>}</div>}
  <div className="en-plans-grid">
   {plans.map((plan,index)=><section className={'en-plan-card'+(index?' en-plan-premium':'')} key={plan.id} aria-label={plan.name+' '+plan.price}>
    <div className="en-plan-card-top">
     <div className="en-plan-title-row"><strong className="en-plan-name">{plan.name}</strong>{index===1&&<span className="en-plan-best">Best Value</span>}</div>
     <p className="en-plan-price">{plan.price}</p>
     {plan.period&&<p className="en-plan-period">{plan.period}</p>}
    </div>
    {index===0&&preview&&<div className="en-plan-card-preview"><img src={preview} alt="Your selected photo preview"/><span>Selected photo preview</span></div>}
    <ul className="en-plan-features">{plan.features.map(item=><li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
    <button type="button" className="en-plan-action" disabled={!ready||(index===1&&premiumRunning)} onClick={()=>startCheckout(plan.id)}>{payBusy?'Preparing…':index===1&&premiumRunning?'Premium Active · '+premiumState.usdPremiumRemaining+' AI Left':plan.button}</button>
    {index===0&&<button type="button" className="single-photo-back" disabled={!ready} onClick={()=>onBackToPhoto?.(plan.id)}>← Back to this photo</button>}
   </section>)}
  </div>
  {!hasTrial&&<p className="en-plan-warning">Create and preview your photo before purchasing a plan.</p>}
  {payMsg&&!['สร้างและปรับแต่งฟรี','เลือกแพ็กเกจเพื่อ'].some(start=>payMsg.startsWith(start))&&<p className="en-plan-message" role="status">{payMsg}</p>}
  <p className="en-plan-retention">Photos are stored for up to 7 days from creation. Download before they expire.</p>
  <details className="en-plan-terms"><summary>How It Works &amp; AI Credits</summary><div>
   <ol>
    <li>Upload a clear photo, then choose your outfit, hairstyle and other edits.</li>
    <li>Review the AI result and adjust the photo before paying.</li>
    <li>Choose Single Image ($6.90) to unlock one selected result, or Premium ($14.90) for 30 days and 20 shared AI generations.</li>
    <li>Choose your size and download a watermark-free PNG or PDF. Make sure the file is saved to your device.</li>
   </ol>
   <p><strong>What uses a Premium credit?</strong> Each newly created AI result uses 1 of the 20 credits, including generating on a different uploaded photo. All AI features share the same 20 credits.</p>
   <p>Changing the source photo, browsing outfits, choosing a hairstyle, using manual tools or reopening and downloading an existing result does not use an AI credit. Failed AI generations without a delivered result are credited back.</p>
   <p>When the 20 credits are used, you can no longer create new AI results until eligible for another purchase. You can still manually edit and download eligible existing photos while they are available. Any unused credits expire after 30 days; they do not roll over.</p>
   <p>Single Image unlocks only the photo selected for checkout; it does not provide new AI generations. Payments do not extend the photo storage period.</p>
   <p>Photos are stored for up to 7 days from creation. Plans are one-time purchases without automatic renewal. <strong>Review your result before checkout.</strong></p>
  </div></details>
  <ServiceTermsLink/>
 </div>;
}

export function PackageOffers({preview,payBusy,payMsg,hasTrial,creditBalance=0,premiumCreditBalance=0,onUseCredit,startCheckout,onOpenCode,onBackToPhoto,isAuthenticated=true,premiumState={}}){
 const english=englishPreviewEnabled();
 const [selected,setSelected]=useState('89');
 if(english)return <EnglishOffers preview={preview} payBusy={payBusy} payMsg={payMsg} hasTrial={hasTrial} startCheckout={startCheckout} onBackToPhoto={onBackToPhoto} premiumState={premiumState}/>;
 const disabled=payBusy||!hasTrial;
 const premiumCredits=Math.max(0,Math.floor(Number(premiumCreditBalance)||0)),credits=Math.max(0,Math.floor(Number(creditBalance)||0))+premiumCredits;
 const usePremium=isAuthenticated&&premiumCredits>0;
 const showMessage=payMsg&&!['สร้างและปรับแต่งฟรี','เลือกแพ็กเกจเพื่อ'].some(p=>payMsg.startsWith(p));
 const choose=price=>{setSelected(price);if(price==='159'&&usePremium)onUseCredit({premium:true});else startCheckout(price)};
 return <div className="idprom-ready-offer paired-offers">
  <header className="offer-step"><span aria-hidden="true">2</span><h2>รับรูปไม่มีลายน้ำ</h2></header>
  <div className="offer-choice-layout">
   <figure className="offer-preview">{preview?<img src={preview} alt="รูปที่จะซื้อ"/>:<span>รูปที่เลือก</span>}{onOpenCode&&<figcaption><button type="button" className="offer-code-entry" disabled={payBusy} onClick={onOpenCode}>ใส่โค้ด</button></figcaption>}</figure>
   <div className="offer-pair" role="radiogroup" aria-label="เลือกแพ็กเกจ">
    {OFFERS.map(offer=><section key={offer.price} className={'offer-card'+(offer.price==='159'?' premium':'')+(selected===offer.price?' selected':'')} aria-label={offer.name+' '+offer.price+' บาท'}>
     <label className="offer-choice-label"><input type="radio" name="photo-package" value={offer.price} checked={selected===offer.price} disabled={disabled} onChange={()=>setSelected(offer.price)} aria-label={'โปร '+offer.price+' บาท'}/><span className="offer-copy"><span className="offer-price">{offer.price} <small>บาท</small>{offer.price==='159'&&<OfferDiamond/>}</span><strong className="offer-name">{offer.name}</strong><span className="offer-features">{offer.features.split(' · ').map(feature=><span key={feature}>{feature}</span>)}</span></span></label>
     <button type="button" className="ready-pay" disabled={disabled} onClick={()=>choose(offer.price)}>{payBusy?'กำลังเตรียม…':offer.price==='159'&&usePremium?'ใช้ 1 สิทธิ์โปร 159':'เลือกโปร '+offer.price+' บาท'}</button>
     {offer.price==='89'&&<button type="button" className="single-photo-back" disabled={disabled} onClick={()=>onBackToPhoto?.('89')}>← ย้อนกลับไปแก้ไขรูปนี้</button>}
    </section>)}
   </div>
  </div>
  <div className="offer-image-scope"><span className="offer-scope-label"><span aria-hidden="true">ⓘ</span> สำหรับงานนี้เท่านั้น</span>{!hasTrial&&<span className="offer-scope-guidance">กรุณาปรับแต่งรูปให้พร้อมดาวน์โหลดก่อนชำระเงิน</span>}</div>
  {isAuthenticated&&credits>0&&<div className="ready-credit"><span>สิทธิ์คงเหลือ {credits} งาน</span><button type="button" disabled={disabled} onClick={()=>onUseCredit({premium:usePremium})}>ใช้ 1 สิทธิ์{usePremium?'โปร 159':''}รับรูปนี้</button></div>}
  {showMessage&&<p role="status" className="ready-message">{payMsg}</p>}
  <details className="en-plan-terms offer-usage-terms"><summary>ขั้นตอนการใช้งานและเงื่อนไขแพ็กเกจ</summary><div>
   <ol>
    <li>อัปโหลดรูปหน้าตรง เลือกชุด ทรงผม และปรับแต่งภาพ</li>
    <li>ตรวจภาพตัวอย่าง ใบหน้า ชุด พื้นหลัง และขนาดให้เรียบร้อยก่อนชำระเงิน</li>
    <li>เลือก 89 บาท เพื่อรับรูปนี้และเลือกชุดรวม 3 ชุดพร้อมทรงผมพื้นฐาน หรือ 159 บาท เพื่อรับรูปนี้และเลือกชุดรวม 5 ชุดพร้อมทรงผมเพิ่มเติม</li>
    <li>เข้าสู่ระบบและชำระเงินหรือใช้สิทธิ์ที่มี แล้วเลือกดาวน์โหลด PNG หรือ PDF ไม่มีลายน้ำ</li>
   </ol>
   <p>แพ็กเกจปลดล็อกสำหรับงานที่เลือกเท่านั้น ชุดที่ใช้อยู่ขณะปลดล็อกนับรวมในจำนวนชุด หลังเลือกครบยังสลับใช้ชุดเดิมได้ แต่รูปต้นฉบับใหม่เป็นคนละงาน</p>
   <p>ตรวจสอบว่าไฟล์ดาวน์โหลดและเปิดได้ก่อนออกจากหน้าเว็บ อ่านรายละเอียดสิทธิ์และข้อกำหนดเพิ่มเติมด้านล่าง</p>
  </div></details>
  <ServiceTermsLink/>
  <div className="offer-payment-method"><img src="/assets/payment/promptpay-logo.png" alt="ชำระเงินผ่านพร้อมเพย์"/></div>
 </div>;
}
