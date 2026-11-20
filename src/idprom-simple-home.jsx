import React,{useState} from 'react';

// The new Thai entry is a real gateway to the unchanged upload, AI and payment
// workflow. There are no simulated uploads, false checkout actions or galleries.
export function IdpromSimpleHome({onUpload,loading=false,sourcePreview=null,status='',memberMenu=null}){
 const [page,setPage]=useState('welcome');
 return <div className="idprom-simple-home">
  <header className="idprom-simple-header">
   <a className="idprom-simple-brand" href="/" aria-label="IDพร้อม หน้าแรก"><span className="idprom-camera-icon" aria-hidden="true">▣</span><span><strong>IDพร้อม</strong><small>รูปติดบัตรด้วย AI</small></span></a>
   <div className="idprom-simple-header-right">{memberMenu}<a href="/id-photo/" className="idprom-simple-info-link">ข้อมูลบริการ</a></div>
  </header>
  <main className="idprom-simple-content">
   {loading||sourcePreview?<section className="idprom-simple-loading" role="status" aria-live="polite">
    {sourcePreview&&<img src={sourcePreview} alt="รูปต้นฉบับที่เลือก" />}
    <span className="idprom-simple-spinner" aria-hidden="true"/>
    <h1>กำลังเตรียมรูปของคุณ</h1>
    <p>ระบบจะพาไปเลือกชุดและทรงผมโดยอัตโนมัติ</p>
   </section>:page==='welcome'?<>
    <div className="idprom-simple-hero"><div className="idprom-simple-intro"><div className="idprom-simple-overline">รูปติดบัตรพร้อมใช้ ไม่ต้องแต่งเอง</div>
    <h1>สร้างรูปติดบัตร<br/>ด้วย AI</h1>
    <p className="idprom-simple-lead">ได้หลายทรงผม หลายชุด จนกว่าจะพอใจ</p></div>
    <div className="idprom-simple-photo-stack" aria-label="ตัวอย่างรูปที่สร้างได้">
     <img className="idprom-photo-left" src="/assets/home-previews/easy-government-v20261030.webp" alt="ตัวอย่างชุดข้าราชการ" loading="eager"/>
     <img className="idprom-photo-right" src="/assets/home-previews/easy-original-v20261031.webp" alt="รูปตัวอย่างก่อนแต่ง" loading="eager"/>
     <img className="idprom-photo-center" src="/assets/home-previews/easy-job-v20261030.webp" alt="ตัวอย่างรูปสมัครงาน" fetchPriority="high" loading="eager"/>
    </div>
    <div className="idprom-simple-actions"><div className="idprom-simple-benefits"><span>✓ เปลี่ยนทรงผมได้หลายแบบ</span><span>✓ มีชุดให้เลือก (สูท / ข้าราชการ / ครุย)</span><span>✓ ดูตัวอย่างก่อนจ่าย</span><span>✓ รับไฟล์ทันทีหลังชำระเงินสำเร็จ</span></div>
    <button className="idprom-simple-primary" type="button" onClick={()=>setPage('upload')}>เริ่มทำรูปเลย <span aria-hidden="true">→</span></button>
    <p className="idprom-simple-reassure">รักษาใบหน้าเดิม · รับไฟล์ PNG / PDF</p></div></div>
   </>:<>
    <div className="idprom-simple-page-heading"><button type="button" onClick={()=>setPage('welcome')} aria-label="กลับ">‹</button><span>ขั้นตอน 1 / เพิ่มรูป</span></div>
    <h1>อัปโหลดรูปของคุณ</h1>
    <p className="idprom-simple-lead">เลือกรูปหน้าตรง ใบหน้าชัดเจน แล้วเลือกชุดและทรงผมต่อ</p>
    <div className="idprom-simple-upload-card">
     <span className="idprom-upload-glyph" aria-hidden="true">↑</span>
     <strong>เพิ่มรูปใบหน้า</strong>
     <p>รองรับไฟล์ JPG, PNG และรูปจากมือถือ</p>
     <button type="button" onClick={onUpload} className="idprom-simple-secondary">เลือกรูปจากเครื่อง</button>
    </div>
    <p className="idprom-simple-tip">ไม่จำเป็นต้องใส่ชุดที่ต้องการในรูปต้นฉบับ</p>
    <button type="button" className="idprom-simple-primary" onClick={onUpload}>เลือกรูปและไปต่อ <span aria-hidden="true">→</span></button>
   </>}
   {!!status&&<p className="idprom-simple-error" role="alert">{status}</p>}
  </main>
  <footer className="idprom-simple-footer"><span>ID PROM TH</span><a href="/id-photo/">รูปสมัครงาน · ชุดข้าราชการ · รูปติดบัตร</a></footer>
 </div>
}
