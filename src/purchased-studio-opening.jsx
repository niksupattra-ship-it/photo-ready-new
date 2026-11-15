import React from 'react';
import {englishPreviewEnabled} from './english-preview.js';
import './purchased-studio-opening.css';

// Visual opening state; image is a purchased preview, not an editable layer.
// Editing controls unlock only after the original Studio layers have loaded.
export function PurchasedStudioOpening({opening,onBack,overlay=false}){
 const english=englishPreviewEnabled(),failed=opening.phase==='error';
 const title=failed?(english?'Could not open this photo':'เปิดรูปเพื่อแก้ไขไม่สำเร็จ'):(english?'IDPROM Studio':'IDพร้อม Studio');
 return <section className={'purchased-opening-screen'+(overlay?' purchased-opening-overlay':'')} role="status" aria-live="polite" aria-busy={!failed}>
  <div className="purchased-opening-top"><strong>IDพร้อม <span>Studio</span></strong><span>{english?'Purchased photo':'รูปที่ซื้อแล้ว'}</span></div>
  <div className="purchased-opening-body">
   <div className="purchased-opening-image">
    {opening.preview?<img src={opening.preview} alt={english?'Purchased photo preview':'ตัวอย่างรูปที่ซื้อแล้ว'}/>:<div className="purchased-opening-placeholder" aria-hidden="true"><span>▧</span></div>}
   </div>
   <div className="purchased-opening-details">
    <span className="purchased-opening-eyebrow">{english?'EDIT PHOTO':'เปิดแก้ไขรูป'}</span>
    <h1>{title}</h1>
    {failed?<p className="purchased-opening-error" role="alert">{opening.error}</p>:<>
     <p>{english?'Your photo is open. Preparing the original editable layers…':'แสดงรูปที่ซื้อแล้วทันที กำลังเตรียมเลเยอร์ต้นฉบับสำหรับแก้ไข…'}</p>
     <div className="purchased-opening-loader" aria-hidden="true"><span/></div>
     <small>{english?'Hair, outfit and other editing tools will be available when the layers finish loading.':'เมื่อเลเยอร์พร้อม จะใช้เครื่องมือเปลี่ยนทรงผม ชุด และปรับรูปได้ตามปกติ'}</small>
     <div className="purchased-opening-disabled-tools" aria-hidden="true"><span>{english?'Hair':'ทรงผม'}</span><span>{english?'Outfit':'ชุด'}</span><span>{english?'Background':'พื้นหลัง'}</span></div>
    </>}
    <button className="purchased-opening-back" type="button" onClick={onBack}>{failed?(english?'Back to purchased photos':'กลับไปที่รูปที่ซื้อแล้ว'):(english?'Cancel opening':'ยกเลิกการเปิด')}</button>
   </div>
  </div>
 </section>;
}
