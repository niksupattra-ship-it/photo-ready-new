import React,{useEffect,useRef,useState} from 'react';
import {EasyPreviewImage} from './easy-preview-image.jsx';
import {outfitChoicePreview,outfitPickerPreview} from './outfit-choice-preview.js';
import {hairPickerPreview} from './hair-picker-preview.js';
import './thai-mobile-journey.css';

// Thai-only visual journey. All AI creation, access rights, checkout,
// native PNG overlays and paid exports remain in the existing StudioEditor.
export function ThaiMobileJourney({
 sourcePreview,canvasRef,renderVersion=0,hasResult=false,watermarked=false,
 processing=false,progress=0,busy=false,ready=true,status='',
 gender='female',photoTypeSelected=false,onSelectPhotoType,
 templates=[],currentSuit='',onSuit,suitLoading=false,suitPolicy={},suitChoiceLimit=3,
 hairs=[],selectedHair='',onHair,onGenerateHair,onConfirmHair,choicesReady=true,
 faceFinish='natural',onSelectFaceFinish,governmentResult=false,insignia,
 onDownload,onStudio,onUpload,onSourceFile,onCancelProcess,memberMenu
}){
 const canvas=useRef(null);
 const [section,setSection]=useState(()=>hasResult?'result':sourcePreview?'upload-review':'choose');
 const [category,setCategory]=useState('สมัครงาน');
 const [draftHair,setDraftHair]=useState('');
 const [selectedStyle,setSelectedStyle]=useState(false);
 const [notice,setNotice]=useState('');
 const [changedHair,setChangedHair]=useState(false);
 const [moreSuits,setMoreSuits]=useState(false),[moreHair,setMoreHair]=useState(false);
 const actionAwaitingRef=useRef(null);
 const resultRef=useRef(false);
 const wasProcessing=useRef(false);
 const srcRef=useRef(sourcePreview);
 useEffect(()=>{
  if(srcRef.current!==sourcePreview){srcRef.current=sourcePreview;setDraftHair('');setSelectedStyle(false);setNotice('');setMoreSuits(false);setMoreHair(false);setSection('upload-review')}
 },[sourcePreview]);
 useEffect(()=>{
  if(hasResult&&!resultRef.current){setSection('result');setChangedHair(false);setNotice('')}
  if(!hasResult&&resultRef.current){setSection('choose')}
  resultRef.current=hasResult;
 },[hasResult]);
 useEffect(()=>{if(wasProcessing.current&&!processing&&hasResult){setSection('result');setChangedHair(false);setNotice('');actionAwaitingRef.current=null}wasProcessing.current=processing},[processing,hasResult]);
 useEffect(()=>{if(actionAwaitingRef.current==='hair'&&hasResult&&!processing){actionAwaitingRef.current=null;setChangedHair(false);setSection('result')}},[renderVersion]);
 useEffect(()=>{
  const src=canvasRef?.current,dst=canvas.current;
  if(!src||!dst||!hasResult)return;
  const draw=()=>{if(!src.width||!src.height)return;dst.width=src.width;dst.height=src.height;const ctx=dst.getContext('2d');ctx.clearRect(0,0,dst.width,dst.height);ctx.drawImage(src,0,0)};
  src.addEventListener('studio-paint',draw);
  draw();
  const frame=requestAnimationFrame(draw);
  return()=>{src.removeEventListener('studio-paint',draw);cancelAnimationFrame(frame)};
 },[canvasRef,hasResult,renderVersion,section]);
 const getCategory=t=>{
  const g=t?.group||'';
  if(/ข้าราชการ|ราชการ/.test(g)||/government-uniforms/.test(t?.template||''))return 'ข้าราชการ';
  if(t?.cat==='gown'||/ครุย/.test(g)||/gown-uniforms/.test(t?.template||''))return 'ชุดครุย';
  if(t?.cat==='student'||/นักศึกษา|นักเรียน/.test(g)||/student-uniforms/.test(t?.template||''))return 'นักศึกษา';
  return 'สมัครงาน';
 };
 const categories=['สมัครงาน','ข้าราชการ','ชุดครุย','นักศึกษา'];
 const eligible=templates.filter(t=>!t.gender||t.gender===gender||getCategory(t)==='ชุดครุย');
 const inCategory=eligible.filter(t=>getCategory(t)===category);
 const chosenSuit=templates.find(t=>t.template===currentSuit);
 const outfits=inCategory.length?inCategory:eligible.filter(t=>getCategory(t)==='สมัครงาน');
 const canSubmit=Boolean(sourcePreview&&photoTypeSelected&&currentSuit&&draftHair&&ready&&!busy&&!suitLoading&&choicesReady);
 const chooseHair=h=>{if(!h)return;setDraftHair(h.id);setSelectedStyle(true);setNotice('');onHair?.(h.id);if(hasResult)setChangedHair(true)};
 const chooseSuit=t=>{setNotice('');onSuit?.(t)};
 const create=()=>{
  if(!photoTypeSelected){setNotice('กรุณาเลือกหญิงหรือชายก่อนสร้าง');return}
  if(!currentSuit){setNotice('กรุณาเลือกชุดก่อนสร้าง');return}
  if(!draftHair){setNotice('กรุณาเลือกทรงผมก่อนสร้าง');return}
  if(!choicesReady){setNotice('กำลังบันทึกตัวเลือก กรุณากดสร้างอีกครั้ง');return}
  if(!ready||busy||suitLoading)return;
  setNotice('');
  onGenerateHair?.(draftHair);
 };
 const preview=hasResult?<div className="thai-mobile-photo"><canvas ref={canvas} aria-label="รูปติดบัตรที่สร้างแล้ว"/>{watermarked&&<div className="thai-mobile-watermark" aria-label="รูปตัวอย่างมีลายน้ำ">ตัวอย่าง IDพร้อม · ตัวอย่าง</div>}</div>:
  <div className="thai-mobile-photo thai-mobile-source">{sourcePreview?<img src={sourcePreview} alt="รูปต้นฉบับที่เลือก" />:<span>เพิ่มรูปเพื่อเริ่มทำ</span>}</div>;
 const optionImg=t=>outfitChoicePreview(t,t?.preview||t?.src||t?.template);
 return <div className="thai-mobile-flow">
  <header className="thai-mobile-header">
   <div className="thai-mobile-brand"><span className="thai-mobile-camera" aria-hidden="true">▣</span><span>ID PROM TH</span></div>
   <div className="thai-mobile-member">{memberMenu}</div>
  </header>
  <main className="thai-mobile-main">
   {!processing&&!hasResult&&section==='upload-review'?<section className="thai-mobile-upload-review" aria-label="ตรวจสอบรูปที่เลือก">
    <div className="thai-mobile-step-overline">ขั้นตอน 2 / 8</div>
    <h1>อัปโหลดรูปของคุณ</h1>
    <div className="thai-mobile-upload-drop" onClick={onUpload} onDragOver={e=>{e.preventDefault()}} onDrop={e=>{e.preventDefault();e.stopPropagation();const file=e.dataTransfer?.files?.[0];if(file&&file.type.startsWith('image/'))onSourceFile?.(file);else setNotice('กรุณาเลือกไฟล์รูปภาพ JPG หรือ PNG')}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onUpload?.()}}>
     <span className="thai-mobile-upload-icon" aria-hidden="true">☁</span>
     <strong>ลากไฟล์มาวาง หรือกดเลือกรูปใหม่</strong>
     <small>รองรับ JPG, PNG และภาพจากมือถือ</small>
    </div>
    {!!notice&&<p className="thai-mobile-alert" role="alert">{notice}</p>}<div className="thai-mobile-upload-preview">{sourcePreview&&<img src={sourcePreview} alt="รูปใบหน้าที่อัปโหลด" />}<button type="button" onClick={onUpload} aria-label="เปลี่ยนรูป">×</button></div>
    <button type="button" className="thai-mobile-primary" onClick={()=>setSection('choose')}>ถัดไป →</button>
   </section>:processing?<section className="thai-mobile-processing" role="status" aria-live="polite">
    <div className="thai-mobile-processing-wheel" aria-hidden="true"/>
    <h1>กำลังสร้างรูป...</h1>
    <p>AI กำลังประมวลผลรูปของคุณ</p>
    <p className="thai-mobile-processing-progress">{Number.isFinite(progress)?Math.min(99,Math.max(0,Math.floor(progress)))+'%':''}</p>
    <p className="thai-mobile-processing-note">ระบบจะนำรูปที่เสร็จแล้วมาแสดงอัตโนมัติ</p>
    {onCancelProcess&&<button type="button" className="thai-mobile-plain" onClick={onCancelProcess}>ยกเลิก</button>}
   </section>:!hasResult?<section className="thai-mobile-select" aria-label="เลือกแบบที่ต้องการ">
    <div className="thai-mobile-step-overline">ขั้นตอน 3 / 8</div>
    <h1>เลือกแบบที่ต้องการ</h1>
    <div className="thai-mobile-selection-grid">
     <aside className="thai-mobile-style-preview"><img src={sourcePreview} alt="รูปต้นฉบับก่อนสร้าง"/><p>รูปของคุณ</p><small>เลือกชุดและทรงผมด้านขวา แล้วให้ AI สร้างรูป</small></aside>
     <div className="thai-mobile-selection-controls">
    <h2>เพศ</h2>
    <div className="thai-mobile-segment">
     {['female','male'].map((v,i)=><button key={v} type="button" className={photoTypeSelected&&gender===v?'selected':''} aria-pressed={photoTypeSelected&&gender===v} disabled={busy} onClick={()=>{setDraftHair('');setSelectedStyle(false);onSelectPhotoType?.(v)}}>{i===0?'หญิง':'ชาย'}</button>)}
    </div>
    <h2>เลือกชุด</h2>
    <div className="thai-mobile-suit-categories" role="group" aria-label="หมวดชุด">
     {categories.map(v=><button key={v} type="button" className={category===v?'selected':''} onClick={()=>setCategory(v)}>{v}</button>)}
    </div>
    <div className="thai-mobile-tile-row thai-mobile-suit-row">
     {outfits.slice(0,moreSuits?24:3).map(t=><button key={t.id||t.template} type="button" className={currentSuit===t.template?'selected':''} disabled={busy||suitLoading||Boolean(suitPolicy?.limited&&(suitPolicy.choices||[]).length>=suitChoiceLimit&&!(suitPolicy.choices||[]).includes(t.template))} onClick={()=>chooseSuit(t)}>
      <EasyPreviewImage source={optionImg(t)} preview={outfitPickerPreview(t,t.preview||t.src||t.template)}/>
      <span>{t.name||t.title||'ชุด'}</span>
      {currentSuit===t.template&&<b className="thai-mobile-tile-check" aria-hidden="true">✓</b>}
     </button>)}
    </div>
    {outfits.length>3&&<button type="button" className="thai-mobile-more" onClick={()=>setMoreSuits(v=>!v)}>{moreSuits?'ดูชุดน้อยลง':'ดูชุดเพิ่มเติม ('+outfits.length+')'}</button>}
    {suitLoading&&<p className="thai-mobile-hint">กำลังแสดงชุดที่เลือก...</p>}
    <h2>เลือกทรงผม</h2>
    <div className="thai-mobile-tile-row thai-mobile-hair-row">
     {hairs.filter(h=>!h.disabled||h.locked).slice(0,moreHair?24:3).map(h=><button type="button" key={h.id} className={draftHair===h.id?'selected':''} disabled={busy} onClick={()=>chooseHair(h)}>
      <EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/>
      <span>{h.name||'ทรงผม'}</span>
      {h.locked&&<small>◆</small>}
      {draftHair===h.id&&<b className="thai-mobile-tile-check" aria-hidden="true">✓</b>}
     </button>)}
    </div>
    {hairs.length>3&&<button type="button" className="thai-mobile-more" onClick={()=>setMoreHair(v=>!v)}>{moreHair?'ดูทรงผมน้อยลง':'ดูทรงผมอื่น'}</button>}
    {gender==='female'&&<><h2>การแต่งหน้า</h2><div className="thai-mobile-segment">
     <button className={faceFinish==='natural'?'selected':''} type="button" onClick={()=>{onSelectFaceFinish?.('natural');if(draftHair)onHair?.(draftHair)}}>ธรรมชาติ</button>
     <button className={faceFinish!=='natural'?'selected':''} type="button" onClick={()=>{onSelectFaceFinish?.('makeup');if(draftHair)onHair?.(draftHair)}}>แต่งหน้าอ่อน</button>
    </div></>}
    <div className="thai-mobile-select-summary">เลือกชุดและทรงผมให้เรียบร้อย แล้วกดสร้างรูปครั้งเดียว</div>
    {!!notice&&<p className="thai-mobile-alert" role="alert">{notice}</p>}
    <button className="thai-mobile-primary" type="button" disabled={!canSubmit||!selectedStyle} onClick={create}>✦ สร้างรูปด้วย AI</button>
    <button className="thai-mobile-plain" type="button" onClick={onUpload}>เปลี่ยนรูปต้นฉบับ</button>
     </div>
    </div>
   </section>:<section className="thai-mobile-result" aria-label="ผลลัพธ์รูปติดบัตร">
    <div className="thai-mobile-step-overline">ขั้นตอน 5 / 8</div>
    <h1>{section==='result'?'รูปของคุณพร้อมแล้ว':section==='hair'?'เปลี่ยนทรงผม':section==='suit'?'เปลี่ยนชุด':section==='insignia'?'เพิ่มเครื่องหมาย':'รูปของคุณ'}</h1>
    <div className="thai-mobile-result-grid">
    {preview}
    <div className="thai-mobile-result-controls">
    {section==='result'?<>
     <div className="thai-mobile-hair-gallery" aria-label="ทรงผมอื่นที่เลือกได้">
      {hairs.filter(h=>!h.disabled||h.locked).slice(0,3).map(h=><button key={h.id} type="button" onClick={()=>{chooseHair(h);setSection('hair')}}><EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/><span>{h.name||'ทรงผม'}</span></button>)}
     </div>
     <button type="button" className="thai-mobile-primary" disabled={!ready||busy} onClick={onDownload}>↓ รับรูปนี้ (ไปชำระเงิน)</button>
     <div className="thai-mobile-result-actions">
      <button type="button" onClick={()=>{setDraftHair(selectedHair||'');setChangedHair(false);setSection('hair')}}>✂ เปลี่ยนทรงผม</button>
      <button type="button" onClick={()=>{setCategory(getCategory(chosenSuit));setSection('suit')}}>♙ เปลี่ยนชุด</button>
      {governmentResult&&<button type="button" onClick={()=>setSection('insignia')}>◈ เครื่องหมาย</button>}
      <button type="button" onClick={onStudio}>⚙ ปรับแต่งเอง</button>
     </div>
    </>:section==='hair'?<>
     <h2>ลองทรงผมอื่นได้ โดยไม่ต้องเพิ่มรูปใหม่</h2>
     <div className="thai-mobile-tile-row thai-mobile-hair-row">
      {hairs.filter(h=>!h.disabled||h.locked).map(h=><button type="button" key={h.id} className={draftHair===h.id?'selected':''} disabled={busy} onClick={()=>chooseHair(h)}>
       <EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/><span>{h.name||'ทรงผม'}</span>{draftHair===h.id&&<b className="thai-mobile-tile-check">✓</b>}
      </button>)}
     </div>
     <button type="button" className="thai-mobile-primary" disabled={!ready||busy||!changedHair||!choicesReady} onClick={()=>{setNotice('');actionAwaitingRef.current='hair';onConfirmHair?.()}}>สร้างรูปทรงนี้</button>
     <button type="button" className="thai-mobile-plain" onClick={()=>setSection('result')}>← กลับไปดูรูป</button>
    </>:section==='suit'?<>
     <h2>เลือกชุดที่ต้องการ</h2>
     <div className="thai-mobile-suit-categories">
      {categories.map(v=><button type="button" key={v} className={category===v?'selected':''} onClick={()=>setCategory(v)}>{v}</button>)}
     </div>
     <div className="thai-mobile-tile-row thai-mobile-suit-row">
      {outfits.map(t=><button key={t.id||t.template} type="button" className={currentSuit===t.template?'selected':''} disabled={busy||suitLoading} onClick={()=>chooseSuit(t)}>
       <EasyPreviewImage source={optionImg(t)} preview={outfitPickerPreview(t,t.preview||t.src||t.template)}/><span>{t.name||t.title||'ชุด'}</span>
      </button>)}
     </div>
     <p className="thai-mobile-hint">เลือกชุดเพื่อดูผลบนรูป ไม่ต้องสร้างใบหน้าใหม่</p>
     <button className="thai-mobile-primary" type="button" onClick={()=>setSection('result')}>เสร็จแล้ว · ดูรูป</button>
    </>:section==='insignia'?<>
     {insignia||<p className="thai-mobile-hint">ไม่มีเครื่องหมายในชุดนี้</p>}
     <button className="thai-mobile-primary" type="button" onClick={()=>setSection('result')}>เสร็จแล้ว · ดูรูป</button>
    </>:null}
    </div></div>
   </section>}
   {status&&/ไม่สำเร็จ|กรุณา|ไม่ถูกต้อง|error|failed/i.test(status)&&<p className="thai-mobile-alert" role="alert">{status}</p>}
  </main>
 </div>;
}
