import React from 'react';
import {ServiceTermsLink} from './service-terms.jsx';
export function PackageOffers({payBusy,payMsg,hasTrial,creditBalance=0,onUseCredit,startCheckout}){
 return <><header className="package-pro-head"><h2 className="package-pro-title">รับรูปไม่มีลายน้ำ</h2><p>สร้างและปรับแต่งฟรีไม่จำกัด จ่ายเมื่อดาวน์โหลด</p></header>
 <div className="package-pro-grid" style={{gridTemplateColumns:'1fr'}}><article className="package-card">
 {creditBalance>0&&<><p>สิทธิ์ดาวน์โหลดเดิมคงเหลือ <strong>{creditBalance}</strong> งาน</p><button className="package-select-btn" disabled={payBusy||!hasTrial} onClick={onUseCredit}>ใช้ 1 สิทธิ์ ปลดล็อกงานนี้</button><p>สร้างรูปไม่หักสิทธิ์ ปลดล็อกแล้วดาวน์โหลดซ้ำทุกขนาดได้</p></>}
 <div className="package-price">89 <small>บาท / งาน</small></div><ul className="package-features"><li>ปลดล็อกงานต้นฉบับนี้ รวมทรงผมที่สร้างในงานเดียวกัน</li><li>ดาวน์โหลดไม่มีลายน้ำ ขนาดเดิมและหลายขนาดได้ไม่จำกัด</li><li>หลังปลดล็อก ระบบเริ่มดาวน์โหลดขนาดเดิมให้ หากเครื่องไม่รองรับให้กดดาวน์โหลดอีกครั้ง</li><li>บัญชีใหม่ไม่รองรับบันทึกงาน กรุณาดาวน์โหลดก่อนออก</li></ul>
 <button className="package-select-btn" disabled={payBusy||!hasTrial} onClick={()=>startCheckout('89')}>{payBusy?'กำลังเตรียม…':'ชำระ 89 บาท ปลดล็อกงานนี้'}</button>{!hasTrial&&<p>กรุณาสร้างรูปให้สำเร็จก่อนปลดล็อกดาวน์โหลด</p>}</article></div>
 {payMsg&&<p role="status" className="credit-pay-msg">{payMsg}</p>}<footer className="package-offer-footer"><ServiceTermsLink/><p>ชำระเงินผ่าน PromptPay</p></footer></>;
}
