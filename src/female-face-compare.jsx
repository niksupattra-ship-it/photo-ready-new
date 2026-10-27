import React from 'react';
import './female-face-compare.css';

/**
 * One continuous before/after face: each half remains a real button.
 * Uses the site's existing finish previews and existing onSelect callback.
 */
export function FemaleFaceCompare({value='natural',onSelect,disabled=false}){
 return <div className="idprom-face-compare" role="group" aria-label="เลือกรูปแบบใบหน้า แต่งหน้าหรือไม่แต่งหน้า">
  <div className="idprom-face-compare__photo">
   <img className="idprom-face-compare__image idprom-face-compare__image--makeup" src="/assets/face-finish/makeup.webp" alt="" decoding="async"/>
   <img className="idprom-face-compare__image idprom-face-compare__image--natural" src="/assets/face-finish/natural.webp" alt="" decoding="async"/>
   <div className="idprom-face-compare__divider" aria-hidden="true"/>
   <button type="button" className={'idprom-face-compare__option idprom-face-compare__option--makeup'+(value==='makeup'?' is-selected':'')} disabled={disabled} aria-pressed={value==='makeup'} onClick={()=>onSelect?.('makeup')}>
    <span className="idprom-face-compare__pill">แต่งหน้า{value==='makeup'&&<span className="idprom-face-compare__check" aria-hidden="true"> ✓</span>}</span>
   </button>
   <button type="button" className={'idprom-face-compare__option idprom-face-compare__option--natural'+(value==='natural'?' is-selected':'')} disabled={disabled} aria-pressed={value==='natural'} onClick={()=>onSelect?.('natural')}>
    <span className="idprom-face-compare__pill">ไม่แต่งหน้า{value==='natural'&&<span className="idprom-face-compare__check" aria-hidden="true"> ✓</span>}</span>
   </button>
  </div>
  <p className="idprom-face-compare__hint">แตะที่ภาพด้านซ้ายหรือด้านขวาเพื่อเลือก</p>
 </div>;
}
