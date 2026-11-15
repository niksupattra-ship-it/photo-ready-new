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


export function EnglishPortraitFlow({step,photo,templates,currentSuit,initialHair='',initialFinish='natural',hairs,busy,draft,onDraftChange,onBack,onManual,onCreate,onChangePhoto,onDismiss,focusHair=false,allowHairChoice=false}){
 const [outfit,setOutfit]=useState(()=>templates.find(t=>t.template===(draft?.outfitPath??currentSuit))||null);
 const [gender,setGender]=useState(draft?.gender||outfit?.gender||'female');
 const [hair,setHair]=useState(draft?.hair??initialHair??''),[finish,setFinish]=useState((draft?.finish||initialFinish)==='natural'?'natural':'makeup');
 const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 // Editing the two independent choices is fully reversible before Create.
 // A customer can pick Hair -> Makeup or Makeup -> Hair in the same job.
 const [choiceFlow,setChoiceFlow]=useState(null);
 const hairChoiceRef=useRef(null),finishChoiceRef=useRef(null);
 const selectHair=id=>{
  setHair(id);
  if(gender!=='female'||!allowHairChoice)return;
  setChoiceFlow(previous=>previous?.origin==='finish'&&previous.step==='hair'?{origin:'finish',step:'ready'}:{origin:'hair',step:'finish'});
 };
 const selectFinish=id=>{
  setFinish(id);
  if(gender!=='female'||!allowHairChoice)return;
  setChoiceFlow(previous=>previous?.origin==='hair'&&previous.step==='finish'?{origin:'hair',step:'ready'}:{origin:'finish',step:'hair'});
 };
 const backChoice=()=>{
  setChoiceFlow(previous=>{
   if(!previous)return null;
   if(previous.step==='ready')return {...previous,step:previous.origin==='hair'?'finish':'hair'};
   if(previous.step==='finish'&&previous.origin==='hair')return {...previous,step:'hair'};
   if(previous.step==='hair'&&previous.origin==='finish')return {...previous,step:'finish'};
   return null;
  });
 };
 useEffect(()=>{
  if(step!=='setup'||!choiceFlow||choiceFlow.step==='ready')return;
  const frame=requestAnimationFrame(()=>{(choiceFlow.step==='hair'?hairChoiceRef:finishChoiceRef).current?.scrollIntoView({block:'nearest',behavior:'smooth'})});
  return()=>cancelAnimationFrame(frame);
 },[step,choiceFlow?.step,choiceFlow?.origin]);

 const panel=useRef(null),locked=busy||submitting;
 const draftChange=useRef(onDraftChange);draftChange.current=onDraftChange;
 useEffect(()=>{draftChange.current?.({outfitPath:outfit?.template||'',hair,finish,gender})},[outfit,hair,finish,gender]);
 useEffect(()=>{const before=document.activeElement;panel.current?.querySelector('button:not(:disabled)')?.focus();return()=>before?.isConnected&&before.focus()},[step]);
 useEffect(()=>{if(step!=='setup'||!focusHair)return;const frame=requestAnimationFrame(()=>panel.current?.querySelector('.english-flow-hair')?.scrollIntoView({block:'center'}));return()=>cancelAnimationFrame(frame)},[step,focusHair]);
 const trap=e=>{if(e.key==='Escape'&&!locked){e.stopPropagation();onDismiss?.();return}if(e.key!=='Tab')return;const items=[...panel.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};
 const submit=async()=>{if(locked||!outfit||(allowHairChoice&&gender==='female'&&choiceFlow?.step!=='ready'))return;setSubmitting(true);setError('');try{await onCreate({outfit,hair,finish:gender==='male'?'natural':finish,gender})}catch(e){setError(e.message||'Could not prepare your portrait. Please try again.')}finally{setSubmitting(false)}};
 return <div className="english-flow-overlay" onClick={e=>{if(e.target===e.currentTarget&&!locked)onDismiss?.()}}><section ref={panel} className="english-flow" role="dialog" aria-modal="true" aria-labelledby="english-flow-title" onKeyDown={trap} aria-busy={locked}>
  <header><span className="english-flow-brand">ID Phrom</span><div className="english-flow-header-actions"><button disabled={locked} onClick={onChangePhoto}>Change photo</button><button disabled={locked} onClick={onDismiss}>← Back to Studio</button></div></header>
  <ol className="english-flow-steps" aria-label="Portrait steps"><li>1. Upload photo</li><li aria-current={step==='choose'?'step':undefined}>2. Edit method</li><li aria-current={step==='setup'?'step':undefined}>3. Outfit &amp; finish</li><li>4. Review &amp; download</li></ol>
  <div className="english-flow-content"><aside>{photo&&<img src={photo} alt="Your uploaded photo"/>}</aside><div className="english-flow-options">
   {step==='choose'?<><h1 id="english-flow-title" className="english-flow-sr-only">Choose an editing method</h1><div className="english-flow-routes"><button disabled={locked} onClick={onBack}><EditingExample/><strong>Create with AI</strong></button><button disabled={locked} onClick={()=>onManual()}><EditingExample manual/><strong>Edit manually</strong></button></div></>:<><button className="english-flow-back" disabled={locked} onClick={onBack}>← Change editing method</button><h1 id="english-flow-title" className="english-flow-sr-only">Choose your outfit and finish</h1><fieldset disabled={locked}><legend className="english-flow-sr-only">Outfit</legend><div className="english-flow-genders">{[['female','Women'],['male','Men']].map(([id,label])=><button key={id} aria-pressed={gender===id} onClick={()=>{setGender(id);setOutfit(null);setHair('');setChoiceFlow(null)}}>{label}</button>)}</div><div className="english-flow-outfits">{templates.filter(t=>!t.gender||t.gender===gender).map((t,i)=><button key={t.template} aria-label={t.name||t.title||'Professional outfit'} aria-pressed={outfit?.template===t.template} onClick={()=>setOutfit(t)}><img src={outfitChoicePreview(t,t.template)} alt="" width="112" height="110" loading={i<10?'eager':'lazy'} fetchPriority={i<5?'high':'auto'} decoding="async"/>{outfit?.template===t.template&&<b aria-hidden="true">✓</b>}</button>)}</div></fieldset>
    {gender==='female'&&<fieldset ref={finishChoiceRef} disabled={locked}><legend className="english-flow-sr-only">Finish</legend>{allowHairChoice&&choiceFlow?.step==='finish'&&<button type="button" className="english-flow-back" onClick={backChoice}>← Back to hairstyle</button>}<div className="english-flow-looks">{['natural','makeup'].map(id=><button key={id} aria-pressed={finish===id} onClick={()=>selectFinish(id)}>{id==='natural'?'No makeup':'Makeup'}</button>)}</div></fieldset>}
    {allowHairChoice&&<fieldset ref={hairChoiceRef} disabled={locked} className="english-flow-hair">{choiceFlow?.step==='hair'&&gender==='female'&&<button type="button" className="english-flow-back" onClick={backChoice}>← Back to makeup</button>}<legend className="english-flow-sr-only">Hairstyle</legend><div className="english-flow-hair-grid"><button type="button" aria-label="Default hairstyle" aria-pressed={!hair} onClick={()=>selectHair('')} className="english-auto-hair-choice"><AutoHairTile gender={gender} english selected={!hair}/></button>{(hairs[gender]||[]).map((h,i)=><button type="button" key={h.id} aria-label={h.name||`Hairstyle ${i+1}`} aria-pressed={hair===h.id} disabled={h.disabled} onClick={()=>selectHair(h.id)}><img src={h.src+(h.id.startsWith('seedream-')?'?hair='+encodeURIComponent(HAIR_DESIGN_VERSION):'')} alt="" loading="lazy" decoding="async"/>{hair===h.id&&<b aria-hidden="true">✓</b>}</button>)}</div></fieldset>}
    {(!allowHairChoice||gender!=='female'||choiceFlow?.step==='ready')&&<><button type="button" className="english-flow-back" disabled={locked} onClick={backChoice}>← Back to previous choice</button><button className="english-flow-primary" disabled={locked||!outfit} onClick={submit}>{locked?'Preparing…':'Create portrait'}</button></>}<button className="english-flow-manual" disabled={locked} onClick={()=>onManual({outfit,hair,finish,gender})}>Edit manually</button>
   </>}{error&&<p role="alert">{error}</p>}
  </div></div>
 </section></div>;
}
