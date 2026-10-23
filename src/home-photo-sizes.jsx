import React,{useState} from 'react';
import {PHOTO_SIZES} from './photo-size.jsx';
import {homePreviewSource} from './home-previews.js';
import './home-photo-sizes.css';

const DEMO_SIZES=PHOTO_SIZES.filter(size=>['original','1-inch','1.5-inch','2-inch','2.5-inch'].includes(size.id));
const ORIGINAL_OUTPUT={width:2256,height:3072};
const outputSize=size=>size.width?{width:Math.round(size.width/25.4*300)*2,height:Math.round(size.height/25.4*300)*2}:ORIGINAL_OUTPUT;

export function HomePhotoSizes({sample,onStart}){
 const [sizeId,setSizeId]=useState('original');
 const size=DEMO_SIZES.find(item=>item.id===sizeId)||DEMO_SIZES[0];
 const output=outputSize(size),original=!size.width;
 const ratio=original?ORIGINAL_OUTPUT.width/ORIGINAL_OUTPUT.height:size.width/size.height;
 const previewWidth=original?280:size.width/48*260;
 if(!sample)return null;
 return <section className="home-photo-sizes" aria-labelledby="home-photo-sizes-title">
  <header className="home-photo-sizes-heading"><div><span className="home-photo-sizes-eyebrow">พร้อมใช้ในขนาดที่ต้องการ</span><h2 id="home-photo-sizes-title">ตัวอย่างขนาดรูป</h2><p>รูปสมัครงานและรูปติดบัตร เลือกดูขนาดก่อนสร้างรูปของคุณ</p></div><span className="home-photo-sizes-tag">เลือกขนาดได้ก่อนดาวน์โหลด</span></header>
  <div className="home-photo-sizes-body">
   <figure className="home-photo-sizes-preview">
    <span className="home-photo-sizes-photo-label">ตัวอย่างรูปสมัครงานหญิง</span>
    <div className="home-photo-sizes-stage">
     <div className="home-photo-sizes-frame" style={{'--home-size-ratio':ratio,'--home-size-width':`${previewWidth}px`}}>
      <span className="home-photo-sizes-ruler horizontal" aria-hidden="true"><span>{original?`${output.width} px`:`${size.width} มม.`}</span></span>
      <span className="home-photo-sizes-ruler vertical" aria-hidden="true"><span>{original?`${output.height} px`:`${size.height} มม.`}</span></span>
      <div className="home-photo-sizes-photo"><img src={homePreviewSource(sample.img)} width="409" height="512" loading="lazy" decoding="async" alt={`ตัวอย่างรูปสมัครงานหญิง ${original?'ขนาดเดิม':size.label}`} onError={event=>{const img=event.currentTarget;if(img.dataset.fallback)return;img.dataset.fallback='1';img.src=sample.img}}/>{!original&&<span className="home-photo-sizes-guides" aria-hidden="true"/>}</div>
     </div>
    </div>
    <figcaption>ภาพแสดงสัดส่วน ขนาดบนหน้าจอไม่ใช่ขนาดพิมพ์จริง</figcaption>
   </figure>
   <div className="home-photo-sizes-controls">
    <div className="home-photo-sizes-control-heading"><h3>เลือกขนาดที่ต้องการ</h3><p>ดูขนาดภาพและไฟล์ที่จะได้จาก Studio</p></div>
    <div className="home-photo-sizes-options" role="group" aria-label="เลือกขนาดภาพตัวอย่าง">{DEMO_SIZES.map(option=>{
     const selected=option.id===sizeId,full=!option.width;
     return <button type="button" key={option.id} className={'home-photo-sizes-option'+(full?' full':'')+(selected?' selected':'')} aria-pressed={selected} onClick={()=>setSizeId(option.id)}>
      <span className="home-photo-sizes-option-icon" aria-hidden="true"><span style={{aspectRatio:full?'2256 / 3072':`${option.width} / ${option.height}`}}/></span>
      <span className="home-photo-sizes-option-copy"><strong>{full?'ขนาดเดิม':option.label}</strong><small>{full?'ไฟล์ความละเอียดสูง':`${option.width} × ${option.height} มม.`}</small></span>
      <span className="home-photo-sizes-option-check" aria-hidden="true">{selected?'✓':''}</span>
     </button>;
    })}</div>
    <div className="home-photo-sizes-result" role="status" aria-live="polite"><span>ขนาดไฟล์จาก Studio</span><strong>{output.width} × {output.height} <small>px</small></strong><p>{original?'ขนาดไฟล์เต็มจาก Studio':'เลือกขนาดนี้ แล้วจัดตำแหน่งและซูมรูปได้ก่อนดาวน์โหลด'}</p></div>
    <button type="button" className="home-photo-sizes-start" onClick={onStart}>สร้างรูปสมัครงานของคุณ <span aria-hidden="true">→</span></button>
   </div>
  </div>
 </section>;
}
