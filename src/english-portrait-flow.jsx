import React,{useEffect,useRef,useState} from 'react';
import {AutoHairTile} from './auto-hair-tile.jsx';
import './english-portrait-flow.css';
import {EnglishExamplePhoto} from './english-example-photo.jsx';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {outfitChoicePreview} from './outfit-choice-preview.js';

function EditingExample({manual=false}){
 return <div className={'english-route-preview '+(manual?'is-manual':'is-ai')} aria-hidden="true">
  {manual?<><div className="english-route-toolbar"><svg viewBox="0 0 72 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9h12M9 3v12m-9-9 3 3-3 3m12-6 3 3-3 3M28 4h10v10H28zM26 6V2h4m6 0h4v4m0 6v4h-4m-6 0h-4v-4M51 5h15M51 9h15M51 13h15m-10-10v4m6 0v4m-8 0v4"/></svg></div><div className="english-route-person"><EnglishExamplePhoto id="female-suit-03" alt=""/><div className="english-route-selection">{[0,1,2,3,4,5,6,7].map(i=><i key={i}/>)}</div></div></>:<><div className="english-route-before"><EnglishExamplePhoto id="original" alt=""/></div><svg className="english-route-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h17m-6-6 6 6-6 6"/></svg><div className="english-route-person"><EnglishExamplePhoto id="female-suit-03" alt=""/></div></>}
 </div>;
}


export function EnglishPortraitFlow({step,photo,templates,currentSuit,initialHair='',initialFinish='natural',initialGender=null,hairs,busy,draft,onDraftChange,onBack,onManual,onCreate,onChangePhoto,onDismiss,focusHair=false,allowHairChoice=false,english=true}){
 const text=(en,th)=>english?en:th;
 const [outfit,setOutfit]=useState(()=>{const option=templates.find(t=>t.template===(draft?.outfitPath??currentSuit));return initialGender&&option?.gender&&option.gender!==initialGender?null:option||null});
 const [gender,setGender]=useState(draft?.gender||initialGender||outfit?.gender||'female');
 const [hair,setHair]=useState(allowHairChoice?(draft?.hair??initialHair??''):''),[finish,setFinish]=useState((draft?.finish||initialFinish)==='natural'?'natural':'makeup');
 const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 // Neither existing starting value counts as an explicit customer choice.
 // Both Hair -> Makeup and Makeup -> Hair must be completed before Create.
 const [choiceFlow,setChoiceFlow]=useState(null);
 const hairChoiceRef=useRef(null),finishChoiceRef=useRef(null);
 const chooseHair=id=>{
  setHair(id);
  if(gender!=='female'||!allowHairChoice)return;
  setChoiceFlow(previous=>previous?.first==='finish'&&previous.step==='hair'
   ?{first:'finish',step:'ready'}:{first:'hair',step:'finish'});
 };
 const chooseFinish=id=>{
  setFinish(id);
  if(gender!=='female'||!allowHairChoice)return;
  setChoiceFlow(previous=>previous?.first==='hair'&&previous.step==='finish'
   ?{first:'hair',step:'ready'}:{first:'finish',step:'hair'});
 };
 useEffect(()=>{
  if(step!=='setup'||!choiceFlow||choiceFlow.step==='ready')return;
  const target=choiceFlow.step==='hair'?hairChoiceRef:finishChoiceRef;
  const frame=requestAnimationFrame(()=>target.current?.scrollIntoView({block:'nearest',behavior:'smooth'}));
  return()=>cancelAnimationFrame(frame);
 },[step,choiceFlow?.step,choiceFlow?.first]);

 const panel=useRef(null),locked=busy||submitting;
 const draftChange=useRef(onDraftChange);draftChange.current=onDraftChange;
 useEffect(()=>{draftChange.current?.({outfitPath:outfit?.template||'',hair,finish,gender})},[outfit,hair,finish,gender]);
 useEffect(()=>{const before=document.activeElement;panel.current?.querySelector('button:not(:disabled)')?.focus();return()=>before?.isConnected&&before.focus()},[step]);
 useEffect(()=>{if(step!=='setup'||!focusHair)return;const frame=requestAnimationFrame(()=>panel.current?.querySelector('.english-flow-hair')?.scrollIntoView({block:'center'}));return()=>cancelAnimationFrame(frame)},[step,focusHair]);
 const trap=e=>{if(e.key==='Escape'&&!locked){e.stopPropagation();onDismiss?.();return}if(e.key!=='Tab')return;const items=[...panel.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};
 const submit=async()=>{if(locked||!outfit||(gender==='female'&&allowHairChoice&&choiceFlow?.step!=='ready'))return;setSubmitting(true);setError('');try{await onCreate({outfit,hair:allowHairChoice?hair:'',finish:gender==='male'?'natural':finish,gender})}catch(e){setError(e.message||text('Could not prepare your portrait. Please try again.','เตรียมรูปไม่สำเร็จ กรุณาลองอีกครั้ง'))}finally{setSubmitting(false)}};
 return <div className="english-flow-overlay" onClick={e=>{if(e.target===e.currentTarget&&!locked)onDismiss?.()}}><section ref={panel} className="english-flow" role="dialog" aria-modal="true" aria-labelledby="english-flow-title" onKeyDown={trap} aria-busy={locked}>
  <header><span className="english-flow-brand">ID Phrom</span><div className="english-flow-header-actions"><button disabled={locked} onClick={onChangePhoto}>{text('Change photo','เปลี่ยนรูป')}</button><button disabled={locked} onClick={onDismiss}>{text('← Back to Studio','← กลับ Studio')}</button></div></header>
  <ol className="english-flow-steps" aria-label={text('Portrait steps','ขั้นตอนสร้างรูป')}><li>{text('1. Upload photo','1. อัปโหลดรูป')}</li><li aria-current={step==='choose'?'step':undefined}>{text('2. Edit method','2. วิธีแก้ไข')}</li><li aria-current={step==='setup'?'step':undefined}>{text('3. Outfit & finish','3. ชุดและการแต่งหน้า')}</li><li>{text('4. Review & download','4. ตรวจรูปและดาวน์โหลด')}</li></ol>
  <div className="english-flow-content"><aside>{photo&&<img src={photo} alt={text('Your uploaded photo','รูปที่อัปโหลด')}/>}</aside><div className="english-flow-options">
   {step==='choose'?<><h1 id="english-flow-title" className="english-flow-sr-only">{text('Choose an editing method','เลือกวิธีแก้ไขรูป')}</h1><div className="english-flow-routes"><button disabled={locked} onClick={onBack}><EditingExample/><strong>{text('Create with AI','สร้างด้วย AI')}</strong></button><button disabled={locked} onClick={()=>onManual()}><EditingExample manual/><strong>{text('Edit manually','แก้ไขเอง')}</strong></button></div></>:<><button className="english-flow-back" disabled={locked} onClick={onBack}>{text('← Change editing method','← เปลี่ยนวิธีแก้ไข')}</button><h1 id="english-flow-title" className="english-flow-sr-only">{text('Choose your outfit and finish','เลือกชุดและการแต่งหน้า')}</h1><fieldset disabled={locked}><legend className="english-flow-sr-only">{text('Outfit','ชุด')}</legend><div className="english-flow-genders">{[['female',text('Women','หญิง')],['male',text('Men','ชาย')]].map(([id,label])=><button key={id} aria-pressed={gender===id} onClick={()=>{setGender(id);setOutfit(null);setHair('');setChoiceFlow(null)}}>{label}</button>)}</div><div className="english-flow-outfits">{templates.filter(t=>!t.gender||t.gender===gender).map((t,i)=><button key={t.template} aria-label={t.name||t.title||text('Professional outfit','ชุดสุภาพ')} aria-pressed={outfit?.template===t.template} onClick={()=>setOutfit(t)}><img src={outfitChoicePreview(t,t.template)} alt="" width="112" height="110" loading={i<10?'eager':'lazy'} fetchPriority={i<5?'high':'auto'} decoding="async"/>{outfit?.template===t.template&&<b aria-hidden="true">✓</b>}</button>)}</div></fieldset>
    {gender==='female'&&<fieldset ref={finishChoiceRef} disabled={locked}><legend className="english-flow-sr-only">{text('Finish','การแต่งหน้า')}</legend><div className="english-flow-looks">{['natural','makeup'].map(id=><button key={id} aria-pressed={finish===id} onClick={()=>chooseFinish(id)}>{id==='natural'?text('No makeup','ไม่แต่งหน้า'):text('Makeup','แต่งหน้า')}</button>)}</div></fieldset>}
    {allowHairChoice&&<fieldset ref={hairChoiceRef} disabled={locked} className="english-flow-hair"><legend className="english-flow-sr-only">{text('Hairstyle','ทรงผม')}</legend><div className="english-flow-hair-grid"><button type="button" aria-label={text('Default hairstyle','ทรงผมเดิม')} aria-pressed={!hair} onClick={()=>chooseHair('')} className="english-auto-hair-choice"><AutoHairTile gender={gender} english={english} selected={!hair}/></button>{(hairs[gender]||[]).map((h,i)=><button type="button" key={h.id} aria-label={h.name||`Hairstyle ${i+1}`} aria-pressed={hair===h.id} disabled={h.disabled} onClick={()=>chooseHair(h.id)}><img src={h.src+(h.id.startsWith('seedream-')?'?hair='+encodeURIComponent(HAIR_DESIGN_VERSION):'')} alt="" loading="lazy" decoding="async"/>{hair===h.id&&<b aria-hidden="true">✓</b>}</button>)}</div></fieldset>}
    {(gender!=='female'||!allowHairChoice||choiceFlow?.step==='ready')&&<button className="english-flow-primary" disabled={locked||!outfit} onClick={submit}>{locked?text('Preparing…','กำลังเตรียม…'):text('Create portrait','สร้างรูป')}</button>}<button className="english-flow-manual" disabled={locked} onClick={()=>onManual({outfit,hair:allowHairChoice?hair:'',finish,gender})}>{text('Edit manually','แก้ไขเอง')}</button>
   </>}{error&&<p role="alert">{error}</p>}
  </div></div>
 </section></div>;
}
