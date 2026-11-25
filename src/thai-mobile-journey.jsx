import './photo-upload-scan.css';
import {FittedPreviewWatermark} from './preview-watermark.jsx';
import {isJobOutfit} from './outfit-choice-preview.js';
import React,{useEffect,useRef,useState} from 'react';
import {EasyPreviewImage} from './easy-preview-image.jsx';
import {outfitChoicePreview,outfitPickerPreview} from './outfit-choice-preview.js';
import {hairPickerPreview} from './hair-picker-preview.js';
import {StudioChoiceIcon} from './studio-icons.jsx';
import {ResultInsigniaDrag} from './result-insignia-drag.jsx';
import './thai-mobile-journey.css';

// Thai-only visual journey. All AI creation, access rights, checkout,
// native PNG overlays and paid exports remain in the existing StudioEditor.
export function ThaiMobileJourney({
 sourcePreview,canvasRef,renderVersion=0,hasResult=false,watermarked=false,
 processing=false,progress=0,busy=false,ready=true,status='',
 gender='female',photoTypeSelected=false,onSelectPhotoType,
 templates=[],currentSuit='',onSuit,suitLoading=false,suitPolicy={},suitChoiceLimit=3,
 backgrounds=[],currentBackground='',onBackground,
 hairs=[],selectedHair='',onHair,onGenerateHair,onConfirmHair,choicesReady=true,
 faceFinish='natural',onSelectFaceFinish,governmentResult=false,insignia,resultInsignia,insigniaHandles=[],onInsigniaStart,onInsigniaTransform,onInsigniaEnd,
 onDownload,onStudio,onUpload,onSourceFile,onCancelProcess,memberMenu
}){
 const canvas=useRef(null);
 const [compactResult,setCompactResult]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width:720px)').matches);
 useEffect(()=>{const mq=window.matchMedia('(max-width:720px)'),change=()=>setCompactResult(mq.matches);change();mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change)},[]);
 const [resultHairOpen,setResultHairOpen]=useState(false);
 const [section,setSection]=useState(()=>hasResult?'result':'choose');
 const [category,setCategory]=useState('สมัครงาน');
 const [draftHair,setDraftHair]=useState('');
 const [selectedStyle,setSelectedStyle]=useState(false);
 const [outfitChosen,setOutfitChosen]=useState(false);
 const [chosenOutfitTemplate,setChosenOutfitTemplate]=useState('');
 const [draftBackground,setDraftBackground]=useState('');
 const [notice,setNotice]=useState('');
 const [changedHair,setChangedHair]=useState(false);
 const [resultInsigniaOpen,setResultInsigniaOpen]=useState(false);
 const [moreSuits,setMoreSuits]=useState(false),[moreHair,setMoreHair]=useState(false);
 const actionAwaitingRef=useRef(null);
 const resultRef=useRef(false);
 const wasProcessing=useRef(false);
 const insigniaAutoOpened=useRef(false);
 useEffect(()=>{
  if(!hasResult){insigniaAutoOpened.current=false;return}
  if(governmentResult&&resultInsignia&&!compactResult&&!insigniaAutoOpened.current){insigniaAutoOpened.current=true;setResultInsigniaOpen(true)}
 },[hasResult,governmentResult,resultInsignia,compactResult]);
 const srcRef=useRef(sourcePreview);
 useEffect(()=>{
  if(srcRef.current!==sourcePreview){srcRef.current=sourcePreview;setDraftHair('');setSelectedStyle(false);setOutfitChosen(false);setChosenOutfitTemplate('');setDraftBackground('');setNotice('');setMoreSuits(false);setMoreHair(false);setResultInsigniaOpen(false);setResultHairOpen(false);setSection('choose')}
 },[sourcePreview]);
 useEffect(()=>{
  if(hasResult&&!resultRef.current){setSection('result');setChangedHair(false);setNotice('')}
  if(!hasResult&&resultRef.current){setResultInsigniaOpen(false);setResultHairOpen(false);setSection('choose')}
  resultRef.current=hasResult;
 },[hasResult]);
 useEffect(()=>{if(wasProcessing.current&&!processing&&hasResult){setSection('result');setResultHairOpen(false);setChangedHair(false);setNotice('');if(governmentResult&&!compactResult)setResultInsigniaOpen(true);actionAwaitingRef.current=null}wasProcessing.current=processing},[processing,hasResult,governmentResult,compactResult]);
 useEffect(()=>{if(actionAwaitingRef.current==='hair'&&hasResult&&!processing){actionAwaitingRef.current=null;setResultHairOpen(false);setChangedHair(false);setSection('result')}},[renderVersion]);
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
 const resultReadyPage=Boolean(hasResult&&section==='result');
 const choicePage=Boolean(!hasResult&&section==='choose'&&!processing);
 const processingPage=Boolean(processing);
 const shownProgress=Number.isFinite(progress)?Math.min(99,Math.max(0,Math.floor(progress))):0;
 const outfits=inCategory.length?inCategory:eligible.filter(t=>getCategory(t)==='สมัครงาน');
 const hairUnlocked=Boolean(photoTypeSelected);
 const suitUnlocked=Boolean(photoTypeSelected&&selectedStyle&&draftHair);
 const outfitReady=Boolean(photoTypeSelected&&selectedStyle&&draftHair&&outfitChosen&&chosenOutfitTemplate===currentSuit&&currentSuit);
 const canSubmit=Boolean(sourcePreview&&outfitReady&&ready&&!busy&&!suitLoading&&choicesReady);
 const chooseHair=h=>{if(!h||(!hasResult&&!hairUnlocked)||busy)return;setDraftHair(h.id);setSelectedStyle(true);setNotice('');onHair?.(h.id);if(hasResult)setChangedHair(!h.cached)};
 const chooseSuit=t=>{if(!t||t.locked||!suitUnlocked||busy||suitLoading)return;setOutfitChosen(true);setChosenOutfitTemplate(t.template);setNotice('');onSuit?.(t)};
 const pickBackground=option=>{
  if(!option||!outfitReady||busy||suitLoading)return;
  setDraftBackground(option.id);setNotice('');onBackground?.(option);
 };
 const bgPalette={'default':'#8cbee9','light-blue':'#b9e5fb','deep-blue':'#2877d7','white':'#ffffff','periwinkle':'#b7b8ee'};

 const selectGender=v=>{
  if(busy||!['female','male'].includes(v))return;
  setDraftHair('');setSelectedStyle(false);setOutfitChosen(false);setChosenOutfitTemplate('');setDraftBackground('');
  setMoreHair(false);setMoreSuits(false);setNotice('');
  onSelectPhotoType?.(v);
 };
 const create=()=>{
  if(!photoTypeSelected){setNotice('กรุณาเลือกหญิงหรือชายก่อนสร้าง');return}
  if(!selectedStyle||!draftHair){setNotice('กรุณาเลือกทรงผมก่อนสร้าง');return}
  if(!outfitChosen||!currentSuit||chosenOutfitTemplate!==currentSuit){setNotice('กรุณาเลือกชุดก่อนสร้าง');return}
  if(!choicesReady){setNotice('กำลังบันทึกตัวเลือก กรุณากดสร้างอีกครั้ง');return}
  if(!ready||busy||suitLoading)return;
  setNotice('');
  onGenerateHair?.(draftHair);
 };
 const preview=hasResult?<div className="thai-mobile-photo"><canvas ref={canvas} aria-label="รูปติดบัตรที่สร้างแล้ว"/>{watermarked&&<FittedPreviewWatermark/>}
  {governmentResult&&resultInsigniaOpen&&<ResultInsigniaDrag handles={insigniaHandles} busy={busy||!ready} onStart={onInsigniaStart} onTransform={onInsigniaTransform} onEnd={onInsigniaEnd}/>}
 </div>:
  <div className="thai-mobile-photo thai-mobile-source">{sourcePreview?<img src={sourcePreview} alt="รูปต้นฉบับที่เลือก" />:<span>เพิ่มรูปเพื่อเริ่มทำ</span>}</div>;
 const optionImg=t=>outfitChoicePreview(t,t?.preview||t?.src||t?.template);
 const selectedHairOptions=hairs.filter(h=>!h.disabled||h.locked);
 const displayHairOptions=selectedHairOptions.slice(0,moreHair?selectedHairOptions.length:6);
 const displayOutfitOptions=outfits.slice(0,moreSuits?24:4);
 const resultHairChoices=(
     <div className={"thai-mobile-hair-gallery thai-mobile-result-hair-choices"+(resultHairOpen?" is-open":"")} aria-label="ลองเปลี่ยนทรงผม">
      {hairs.filter(h=>!h.disabled||h.locked).slice(0,3).map(h=><button key={h.id} type="button" className={(selectedHair||draftHair)===h.id?'selected':''} aria-label={h.name||'ทรงผม'} aria-pressed={(selectedHair||draftHair)===h.id} onClick={()=>{chooseHair(h);if(!compactResult&&!h.cached)setSection('hair')}}><EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/>{(selectedHair||draftHair)===h.id&&<b className="thai-mobile-tile-check" aria-hidden="true">✓</b>}</button>)}
      {compactResult&&changedHair&&<button type="button" className="mobile-hair-create" disabled={!ready||busy||!choicesReady} onClick={()=>{setNotice('');actionAwaitingRef.current='hair';onConfirmHair?.()}}>สร้างรูปทรงนี้</button>}
     </div>
 );
 return <div className={'thai-mobile-flow'+(resultReadyPage?' thai-mobile-flow-ready':'')+(choicePage?' thai-mobile-flow-choice':'')+(processingPage?' thai-mobile-flow-processing':'')}>
  <header className="thai-mobile-header">
   <div className="thai-mobile-brand"><span className="thai-mobile-camera" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 10h5l2-3h7l2 3h4a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3Z"/><circle cx="16" cy="19" r="6"/><path d="M24 14h.01"/></svg></span><span>{resultReadyPage||choicePage||processingPage?<><strong>IDพร้อม</strong><small>AI ID PHOTO</small></>:'ID PROM TH'}</span></div>
   <div className="thai-mobile-member">

    {memberMenu}
   </div>
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
   </section>:processing?<section className="thai-mobile-processing" role="status" aria-live="polite" aria-label="กำลังตัดต่อรูป">
    <div className="thai-mobile-processing-card">
     <div className="portrait-processing-scan">{sourcePreview&&<img src={sourcePreview} alt="รูปที่กำลังประมวลผล"/>}{shownProgress<100&&<div className="photo-upload-scan-beam" aria-hidden="true"/>}</div>
     <div className="photo-scan-progress" role="progressbar" aria-label="ความคืบหน้าการสร้างรูป" aria-valuemin={0} aria-valuemax={100} aria-valuenow={shownProgress}><strong>{shownProgress}%</strong><div className="photo-scan-track"><i style={{width:shownProgress+'%'}}/></div></div>
     <h1>กำลังตัดต่อรูป..</h1>
     <p className="thai-mobile-processing-subtitle">กรุณารอจนกว่าจะเสร็จ</p>
     <p className="thai-mobile-processing-note"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2.5 20 6v5.8c0 5.4-3.1 8.6-8 10-4.9-1.4-8-4.6-8-10V6Z"/><path d="m8.7 12.2 2.2 2.1 4.6-4.7"/></svg><span>ระบบจะนำรูปที่เสร็จแล้วมาแสดงอัตโนมัติ</span></p>
     {onCancelProcess&&<button type="button" className="thai-mobile-processing-cancel" onClick={onCancelProcess}>ยกเลิก</button>}
    </div>
   </section>:!hasResult?<section className="thai-mobile-select thai-mobile-choice" aria-label="ปรับแต่งและสร้างรูป">
    <nav className="thai-mobile-choice-steps" aria-label="ขั้นตอนการสร้างรูป">
     <div className="thai-mobile-choice-step completed"><span className="thai-mobile-choice-step-marker">✓</span><span>เพิ่มรูป</span></div>
     <div className="thai-mobile-choice-line active" aria-hidden="true"/>
     <div className="thai-mobile-choice-step current" aria-current="step"><span className="thai-mobile-choice-step-marker">2</span><span>ปรับแต่งและสร้างรูป</span></div>
     <div className="thai-mobile-choice-line" aria-hidden="true"/>
     <div className="thai-mobile-choice-step"><span className="thai-mobile-choice-step-marker">3</span><span>ดาวน์โหลดรูป</span></div>
    </nav>
    <div className="thai-mobile-choice-card">
     <div className="thai-mobile-selection-grid thai-mobile-choice-grid">
      <aside className="thai-mobile-choice-preview" aria-label="รูปต้นฉบับ">
       <div className="thai-mobile-choice-photo-wrap">
        {sourcePreview?<img src={sourcePreview} alt="รูปต้นฉบับที่อัปโหลด" />:<div className="thai-mobile-choice-photo-placeholder">กรุณาเพิ่มรูป</div>}
        <span className="thai-mobile-choice-photo-label">รูปต้นฉบับ</span>
       </div>
       <div className="thai-mobile-choice-photo-actions">
        <span className="thai-mobile-choice-current-photo">ก่อนปรับแต่ง</span>
        <button type="button" onClick={onUpload} disabled={busy}>เปลี่ยนรูป</button>
       </div>
       <p className="thai-mobile-choice-preview-help">รูปหลังปรับแต่งจะแสดงเมื่อสร้างเสร็จ</p>
      </aside>
      <div className="thai-mobile-selection-controls thai-mobile-choice-controls">
       <div className="thai-mobile-choice-panel thai-mobile-choice-gender">
        <h2>เลือกเพศ</h2>
        <div className="thai-mobile-segment">
         {['female','male'].map((v,i)=><button key={v} type="button" className={photoTypeSelected&&gender===v?'selected':''} aria-pressed={photoTypeSelected&&gender===v} disabled={busy} onClick={()=>selectGender(v)}>{i===0?'หญิง':'ชาย'}</button>)}
        </div>
       </div>
       <section className={'thai-mobile-choice-panel thai-mobile-choice-hair-panel'+(!hairUnlocked?' thai-mobile-choice-locked':'')} aria-label="เลือกทรงผม" aria-disabled={!hairUnlocked}>
        <div className="thai-mobile-choice-panel-heading"><h2><span aria-hidden="true">✂</span> ทรงผม</h2>
         {selectedHairOptions.length>6&&<button type="button" className="thai-mobile-choice-view-all" disabled={!hairUnlocked||busy} onClick={()=>setMoreHair(v=>!v)}>{moreHair?'แสดงน้อยลง':'ดูทั้งหมด ›'}</button>}
        </div>
        <div className="thai-mobile-tile-row thai-mobile-hair-row thai-mobile-choice-tiles">
         {displayHairOptions.map(h=><button type="button" key={h.id} className={draftHair===h.id?'selected':''} aria-pressed={draftHair===h.id} aria-label={h.name||'ทรงผม'} disabled={busy||!hairUnlocked} onClick={()=>chooseHair(h)}>
          <EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/>
          {h.locked&&<small className="thai-mobile-choice-diamond">◆</small>}
          {draftHair===h.id&&<b className="thai-mobile-tile-check" aria-hidden="true">✓</b>}
         </button>)}
        </div>
       </section>
       <section className={'thai-mobile-choice-panel thai-mobile-choice-outfit-panel'+(!suitUnlocked?' thai-mobile-choice-locked':'')} aria-label="เลือกชุด" aria-disabled={!suitUnlocked}>
        <div className="thai-mobile-choice-panel-heading"><h2><span aria-hidden="true">♧</span> ชุด</h2></div>
        <div className="thai-mobile-suit-categories" role="group" aria-label="หมวดชุด">
         {categories.map(v=><button key={v} type="button" className={category===v?'selected':''} aria-pressed={category===v} disabled={!suitUnlocked||busy} onClick={()=>{if(!suitUnlocked)return;setCategory(v);setMoreSuits(false)}}>{v}</button>)}
        </div>
        <div className="thai-mobile-tile-row thai-mobile-suit-row thai-mobile-choice-tiles">
         {displayOutfitOptions.map(t=><button key={t.id||t.template} type="button" className={(outfitChosen&&currentSuit===t.template?'selected ':'')+(t.locked?'unavailable':'')} aria-label={t.name||t.title||'ชุด'} aria-pressed={outfitChosen&&currentSuit===t.template} title={t.locked?'ต้องมีสิทธิ์โปร 159 เพื่อเลือกชุดนี้':undefined} disabled={Boolean(t.locked)||busy||!suitUnlocked||suitLoading||Boolean(suitPolicy?.limited&&(suitPolicy.choices||[]).length>=suitChoiceLimit&&!(suitPolicy.choices||[]).includes(t.template))} onClick={()=>chooseSuit(t)}>
          <EasyPreviewImage source={optionImg(t)} preview={outfitPickerPreview(t,t.preview||t.src||t.template)}/>
          {!isJobOutfit(t)&&<span>{t.name||t.title||'ชุด'}</span>}
          {outfitChosen&&currentSuit===t.template&&<b className="thai-mobile-tile-check" aria-hidden="true">✓</b>}
         </button>)}
        </div>
        {outfits.length>4&&<button type="button" className="thai-mobile-choice-outfit-more" disabled={!suitUnlocked||busy} onClick={()=>setMoreSuits(v=>!v)}>{moreSuits?'ดูชุดน้อยลง':'ดูชุดเพิ่มเติม ('+outfits.length+')'}</button>}
        {suitLoading&&<p className="thai-mobile-hint">กำลังแสดงชุดที่เลือก...</p>}
       </section>
       <section className={'thai-mobile-choice-panel thai-mobile-choice-background-panel'+(!outfitReady?' thai-mobile-choice-locked':'')} aria-label="เลือกสีพื้นหลัง" aria-disabled={!outfitReady}>
        <div className="thai-mobile-choice-panel-heading"><h2>สีพื้นหลัง</h2></div>
        <div className="thai-mobile-choice-background-colors" role="group" aria-label="สีพื้นหลังสำหรับรูปที่สร้าง">
         {backgrounds.filter(b=>bgPalette[b.id]).map(b=><button key={b.id} type="button"
           className={'thai-mobile-choice-background-option'+((draftBackground||currentBackground)===b.id?' selected':'')}
           title={b.name} aria-label={b.name} aria-pressed={(draftBackground||currentBackground)===b.id}
           disabled={!outfitReady||busy||suitLoading} onClick={()=>pickBackground(b)}>
          <span className="thai-mobile-choice-background-dot" style={{backgroundColor:bgPalette[b.id]}} aria-hidden="true"/>
          <span className="thai-mobile-choice-background-name">{b.name}</span>
         </button>)}
        </div>
       </section>
      </div>
     </div>
     <div className="thai-mobile-choice-footer">
      {!!notice&&<p className="thai-mobile-alert" role="alert">{notice}</p>}
      <button className="thai-mobile-primary thai-mobile-choice-create" type="button" disabled={!canSubmit} onClick={create}><span aria-hidden="true">✦</span> สร้างรูป</button>
      <p className="thai-mobile-choice-caption"><span aria-hidden="true">ⓘ</span> สร้างภาพด้วย AI เพียง 1 ครั้ง จากตัวเลือกที่เลือกไว้</p>
     </div>
    </div>
   </section>:<section className={'thai-mobile-result'+(resultReadyPage?' thai-mobile-result-ready-page':'')} aria-label="ผลลัพธ์รูปติดบัตร">
    {!resultReadyPage&&<div className="thai-mobile-step-overline">ขั้นตอน 5 / 8</div>}
    {!resultReadyPage&&<h1>{section==='hair'?'เปลี่ยนทรงผม':'รูปของคุณ'}</h1>}
    <div className={'thai-mobile-result-grid'+(resultReadyPage?' thai-mobile-result-layout-ready':'')}>
    {resultReadyPage?<div className="thai-mobile-result-preview-column">
     <div className="thai-mobile-result-photo-card">
      <div className="thai-mobile-result-photo-wrap">
       {preview}
       <span className="thai-mobile-result-preview-label">ภาพตัวอย่าง</span>
      </div>
      <div className="thai-mobile-result-photo-summary"><button type="button" className="thai-mobile-result-replace-photo" aria-label="เปลี่ยนรูปใหม่" title="เปลี่ยนรูปใหม่" disabled={!ready||busy} onClick={onUpload}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="15" height="16" rx="2"/><circle cx="8" cy="10" r="1.5"/><path d="m4 18 5-5 4 4 3-3M19 2v6m-3-3h6"/></svg></button></div>
     </div>
     {!compactResult&&resultHairChoices}
    </div>:preview}
    <div className="thai-mobile-result-controls">
    {section==='result'?<>
     {compactResult&&<div className="thai-mobile-result-tool-slot">
      {resultHairOpen||resultInsigniaOpen?<section className="thai-mobile-result-tool-panel" aria-label={resultHairOpen?'เลือกทรงผม':'เลือกเครื่องหมาย'}>
       <header className="thai-mobile-result-tool-heading"><button type="button" aria-label="ย้อนกลับไปแถวเครื่องมือ" disabled={busy} onClick={()=>{setResultHairOpen(false);setResultInsigniaOpen(false)}}>←</button></header>
       {resultHairOpen?resultHairChoices:<div className="thai-mobile-result-insignia-panel" aria-label="เลือกและวางเครื่องหมายบนรูป">{resultInsignia}</div>}
      </section>:<>
     <nav className="thai-mobile-result-icon-row" aria-label="เครื่องมือรูปที่เสร็จแล้ว" style={{'--result-action-count':governmentResult&&resultInsignia?4:3}}>
      <button type="button" disabled={!ready||busy} aria-expanded={resultHairOpen} onClick={()=>{setResultHairOpen(v=>!v);setResultInsigniaOpen(false)}}><StudioChoiceIcon kind="hair"/><small>ทรงผม</small></button>
      {governmentResult&&resultInsignia&&<button type="button" disabled={!ready||busy} aria-expanded={resultInsigniaOpen} onClick={()=>{setResultInsigniaOpen(v=>!v);setResultHairOpen(false)}}><StudioChoiceIcon kind="chest"/><small>เครื่องหมาย</small></button>}
      <button type="button" disabled={!ready||busy} onClick={onDownload}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><small>ดาวน์โหลด</small></button>
      <button type="button" disabled={!ready||busy} onClick={onStudio}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/></svg><small>ปรับในสตู</small></button>
     </nav>
      </>}
     </div>}
     <div className="thai-mobile-result-success"><span className="thai-mobile-result-success-check" aria-hidden="true">✓</span><strong>รูปของคุณพร้อมแล้ว</strong></div>
     {governmentResult&&resultInsignia&&<div className="thai-mobile-result-insignia-inline">
      <button type="button" className={'thai-mobile-result-insignia-launch'+(resultInsigniaOpen?' active':'')} aria-expanded={resultInsigniaOpen} disabled={!ready||busy} onClick={()=>setResultInsigniaOpen(v=>!v)}>◈ {resultInsigniaOpen?'ปิดเครื่องหมาย':'เพิ่มเครื่องหมายข้าราชการ'}</button>
      {resultInsigniaOpen&&!compactResult&&<div className="thai-mobile-result-insignia-panel" aria-label="เลือกและวางเครื่องหมายบนรูป">
       {resultInsignia}
      </div>}
     </div>}
     <button type="button" className="thai-mobile-primary thai-mobile-result-download" disabled={!ready||busy} onClick={onDownload}><span aria-hidden="true">↓</span> ดาวน์โหลดรูป</button>
     <button type="button" className="thai-mobile-result-studio" disabled={!ready||busy} onClick={onStudio}><span aria-hidden="true">⚙</span> ปรับแต่งในสตูดิโอ</button>
    </>:section==='hair'?<>
     <h2>ลองทรงผมอื่นได้ โดยไม่ต้องเพิ่มรูปใหม่</h2>
     <div className="thai-mobile-tile-row thai-mobile-hair-row">
      {hairs.filter(h=>!h.disabled||h.locked).slice(0,compactResult?3:undefined).map(h=><button type="button" key={h.id} className={draftHair===h.id?'selected':''} disabled={busy} aria-label={h.name||'ทรงผม'} onClick={()=>chooseHair(h)}>
       <EasyPreviewImage source={h.src} preview={hairPickerPreview(h.src)}/>{draftHair===h.id&&<b className="thai-mobile-tile-check">✓</b>}
      </button>)}
     </div>
     <button type="button" className="thai-mobile-primary" disabled={!ready||busy||!changedHair||!choicesReady} onClick={()=>{setNotice('');actionAwaitingRef.current='hair';onConfirmHair?.()}}>สร้างรูปทรงนี้</button>
     <button type="button" className="thai-mobile-plain" onClick={()=>setSection('result')}>← กลับไปดูรูป</button>
    </>:null}
    </div></div>
   </section>}
   {status&&/ไม่สำเร็จ|กรุณา|ไม่ถูกต้อง|error|failed/i.test(status)&&<p className="thai-mobile-alert" role="alert">{status}</p>}
  </main>
 </div>;
}
