import React,{useState} from 'react';
import './package-offers.css';

const OFFERS=[
 {price:'89',name:'รับรูปนี้',features:'เลือกชุด 3 ชุด · ผมพื้นฐาน'},
 {price:'159',name:'รับรูปนี้ + ทรงผม',features:'เลือกชุด 5 ชุด · ปลดล็อกผม'}
];
export function PackageOffers({preview,payBusy,payMsg,hasTrial,creditBalance=0,premiumCreditBalance=0,onUseCredit,startCheckout,isAuthenticated=true}){
 const [selected,setSelected]=useState('89');
 const disabled=payBusy||!hasTrial;
 const premiumCredits=Math.max(0,Math.floor(Number(premiumCreditBalance)||0)),credits=Math.max(0,Math.floor(Number(creditBalance)||0))+premiumCredits;
 const usePremium=isAuthenticated&&premiumCredits>0;
 const showMessage=payMsg&&!['สร้างและปรับแต่งฟรี','เลือกแพ็กเกจเพื่อ'].some(p=>payMsg.startsWith(p));
 const choose=price=>{setSelected(price);if(price==='159'&&usePremium)onUseCredit({premium:true});else startCheckout(price)};
 return <div className="idprom-ready-offer paired-offers">
  <div className="offer-step"><span aria-hidden="true">2</span>เลือกแพ็กเกจ</div>
  <div className="offer-brand" aria-label="IDพร้อม">ID<span>พร้อม</span></div>
  <header className="ready-heading"><h2>รับรูปไม่มีลายน้ำ</h2></header>
  <div className="offer-choice-layout">
   <figure className="offer-preview">{preview?<img src={preview} alt="รูปที่จะซื้อ"/>:<span>รูปที่เลือก</span>}</figure>
   <div className="offer-pair" role="radiogroup" aria-label="เลือกแพ็กเกจ">
    {OFFERS.map(offer=><section key={offer.price} className={'offer-card'+(selected===offer.price?' selected':'')} aria-label={offer.name+' '+offer.price+' บาท'}>
     <label className="offer-choice-label"><input type="radio" name="photo-package" value={offer.price} checked={selected===offer.price} disabled={disabled} onChange={()=>setSelected(offer.price)} aria-label={'โปร '+offer.price+' บาท'}/><span className="offer-copy"><span className="offer-price">{offer.price} <small>บาท</small></span><strong className="offer-name">{offer.name}</strong><span className="offer-features">{offer.features}</span></span></label>
     <button type="button" className="ready-pay" disabled={disabled} onClick={()=>choose(offer.price)}>{payBusy?'กำลังเตรียม…':offer.price==='159'&&usePremium?'ใช้ 1 สิทธิ์โปร 159':'เลือกโปร '+offer.price+' บาท'}</button>
    </section>)}
   </div>
  </div>
  <p className="offer-image-scope"><span aria-hidden="true">ⓘ</span> สำหรับงานนี้เท่านั้น</p>
  {isAuthenticated&&credits>0&&<div className="ready-credit"><span>สิทธิ์คงเหลือ {credits} งาน</span><button type="button" disabled={disabled} onClick={()=>onUseCredit({premium:usePremium})}>ใช้ 1 สิทธิ์{usePremium?'โปร 159':''}รับรูปนี้</button></div>}
  {!hasTrial&&<p className="ready-message">กรุณาสร้างรูปให้สำเร็จก่อนรับรูป</p>}
  {showMessage&&<p role="status" className="ready-message">{payMsg}</p>}
 </div>;
}
