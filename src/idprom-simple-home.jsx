import React,{useState} from 'react';

// The new Thai entry is a real gateway to the unchanged upload, AI and payment
// workflow. There are no simulated uploads, false checkout actions or galleries.
export function IdpromSimpleHome({onUpload,loading=false,sourcePreview=null,status='',memberMenu=null}){
 const [page,setPage]=useState('welcome');
 return <div className="idprom-simple-home">
  <header className="idprom-simple-header">
   <a className="idprom-simple-brand" href="/" aria-label="IDพร้อม หน้าแรก"><span className="idprom-camera-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10h5l2-3h7l2 3h4a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3Z"/><circle cx="16" cy="19" r="6"/><path d="M24 14h.01"/></svg></span><span><strong>IDพร้อม</strong><small>รูปติดบัตรออนไลน์</small></span></a>
   <div className="idprom-simple-header-right">{memberMenu}<a href="/id-photo/" className="idprom-simple-info-link">ข้อมูลบริการ</a></div>
  </header>
  <main className="idprom-simple-content">
   {loading||sourcePreview?<section className="idprom-simple-loading" role="status" aria-live="polite">
    {sourcePreview&&<img src={sourcePreview} alt="รูปต้นฉบับที่เลือก" />}
    <span className="idprom-simple-spinner" aria-hidden="true"/>
    <h1>กำลังเตรียมรูปของคุณ</h1>
    <p>ระบบจะพาไปเลือกชุดและทรงผมโดยอัตโนมัติ</p>
   </section>:page==='welcome'?<>
    <div className="idprom-simple-hero"><div className="idprom-simple-intro">
    <h1>สร้างรูปติดบัตรง่าย ๆ<br/>เหมือนถ่ายที่ร้าน</h1>
    </div>
    <div className="idprom-simple-photo-stack" aria-label="ตัวอย่างรูปที่สร้างได้">
     <img className="idprom-photo-left" src="/assets/home-previews/easy-government-v20261030.webp" alt="ตัวอย่างชุดข้าราชการ" loading="eager"/>
     <img className="idprom-photo-right" src="/assets/home-previews/easy-original-v20261031.webp" alt="รูปตัวอย่างก่อนแต่ง" loading="eager"/>
     <img className="idprom-photo-center" src="/assets/home-previews/easy-job-v20261030.webp" alt="ตัวอย่างรูปสมัครงาน" fetchPriority="high" loading="eager"/>
    </div>
    <div className="idprom-simple-actions"><div className="idprom-simple-benefits"><span>✓ เปลี่ยนทรงผมได้หลายแบบ</span><span>✓ มีชุดให้เลือก (สูท / ข้าราชการ / ครุย)</span><span>✓ ดูตัวอย่างก่อนจ่าย</span><span>✓ รับไฟล์ทันทีหลังชำระเงินสำเร็จ</span></div>
    <button className="idprom-simple-primary" type="button" onClick={()=>setPage('upload')}>เริ่มทำรูปเลย <span aria-hidden="true">→</span></button>
    <p className="idprom-simple-reassure">รักษาใบหน้าเดิม · รับไฟล์ PNG / PDF</p></div></div>
   </>:<>
    <section className="idprom-simple-upload-step" aria-label="อัปโหลดรูปของคุณ">
     <button className="idprom-simple-upload-back" type="button" onClick={()=>setPage('welcome')} aria-label="กลับหน้าแรก">‹</button>
     <h1>อัปโหลดรูปของคุณ</h1>
     <div className="idprom-simple-upload-card" aria-label="เพิ่มรูป">
      <span className="idprom-upload-glyph" aria-hidden="true">
       <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.4 17.5H6a4 4 0 0 1-.2-8 6.3 6.3 0 0 1 12.1 0 4.2 4.2 0 0 1 .6 8h-.7"/><path d="M12 19V10m-3.5 3.5L12 10l3.5 3.5"/></svg>
      </span>
      <h2>เพิ่มรูป</h2>
      <button type="button" onClick={onUpload} disabled={loading} className="idprom-simple-upload-submit">อัปโหลดรูป</button>
      <p className="idprom-simple-upload-hint">ใช้รูปหน้าตรง ใบหน้าชัดเจน</p>
     </div>
    </section>
   </>}
   {!!status&&<p className="idprom-simple-error" role="alert">{status}</p>}
  </main>
  <footer className="idprom-simple-footer"><span>ID PROM TH</span><a href="/id-photo/">รูปสมัครงาน · ชุดข้าราชการ · รูปติดบัตร</a></footer>
 </div>
}
