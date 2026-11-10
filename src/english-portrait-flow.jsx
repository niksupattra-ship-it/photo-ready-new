import React,{useEffect,useRef,useState} from 'react';
import './english-portrait-flow.css';

export function EnglishPortraitFlow({step,photo,templates,currentSuit,initialHair='',initialFinish='natural',hairs,busy,onBack,onManual,onCreate,onChangePhoto}){
 const [outfit,setOutfit]=useState(()=>templates.find(t=>t.template===currentSuit)||null);
 const [gender,setGender]=useState(outfit?.gender||'female');
 const [hair,setHair]=useState(initialHair),[finish,setFinish]=useState(initialFinish==='natural'?'natural':'makeup');
 const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false);
 const panel=useRef(null),locked=busy||submitting;
 useEffect(()=>{const before=document.activeElement;panel.current?.querySelector('button:not(:disabled)')?.focus();return()=>before?.isConnected&&before.focus()},[step]);
 const trap=e=>{if(e.key!=='Tab')return;const items=[...panel.current.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}};
 const submit=async()=>{if(locked||!outfit)return;setSubmitting(true);setError('');try{await onCreate({outfit,hair,finish:gender==='male'?'natural':finish,gender})}catch(e){setError(e.message||'Could not prepare your portrait. Please try again.')}finally{setSubmitting(false)}};
 return <div className="english-flow-overlay"><section ref={panel} className="english-flow" role="dialog" aria-modal="true" aria-labelledby="english-flow-title" onKeyDown={trap} aria-busy={locked}>
  <header><span className="english-flow-brand">ID Phrom <small>Portrait Studio</small></span><button disabled={locked} onClick={onChangePhoto}>Change photo</button></header>
  <ol className="english-flow-steps" aria-label="Portrait steps"><li>1. Upload photo</li><li aria-current={step==='choose'?'step':undefined}>2. Choose how to edit</li><li aria-current={step==='setup'?'step':undefined}>3. Outfit & look</li><li>4. Review & download</li></ol>
  <div className="english-flow-content"><aside>{photo&&<img src={photo} alt="Your uploaded photo"/>}<span>Your photo</span></aside><div className="english-flow-options">
   {step==='choose'?<><h1 id="english-flow-title">Choose how to edit</h1><p>Create your portrait, your way.</p><div className="english-flow-routes"><button disabled={locked} onClick={onBack}><span aria-hidden="true">✦</span><strong>AI outfit</strong><small>Choose an outfit. AI creates your portrait.</small><b>Choose outfit →</b></button><button disabled={locked} onClick={onManual}><span aria-hidden="true">↔</span><strong>Edit manually</strong><small>Place an outfit and adjust the fit yourself.</small><b>Open Studio →</b></button></div></>:<><button className="english-flow-back" disabled={locked} onClick={onBack}>← Change editing method</button><h1 id="english-flow-title">Choose outfit & look</h1><fieldset disabled={locked}><legend>Outfit</legend><div className="english-flow-genders">{[['female','Women'],['male','Men']].map(([id,label])=><button key={id} aria-pressed={gender===id} onClick={()=>{setGender(id);setOutfit(null);setHair('')}}>{label}</button>)}</div><div className="english-flow-outfits">{templates.filter(t=>!t.gender||t.gender===gender).map(t=><button key={t.template} aria-label={t.name||t.title||'Professional outfit'} aria-pressed={outfit?.template===t.template} onClick={()=>setOutfit(t)}><img src={t.template} alt="" loading="lazy"/>{outfit?.template===t.template&&<b aria-hidden="true">✓</b>}</button>)}</div></fieldset>
    {gender==='female'&&<fieldset disabled={locked}><legend>Look</legend><div className="english-flow-looks">{['natural','makeup'].map(id=><button key={id} aria-pressed={finish===id} onClick={()=>setFinish(id)}>{id==='natural'?'Natural':'Makeup'}</button>)}</div></fieldset>}
    <label className="english-flow-hair">Hairstyle<select value={hair} disabled={locked} onChange={e=>setHair(e.target.value)}><option value="">Original hairstyle</option>{(hairs[gender]||[]).map(h=><option key={h.id} value={h.id} disabled={h.disabled}>{h.name}</option>)}</select></label>
    <p className="english-flow-note">AI will create your portrait wearing the selected outfit.</p><button className="english-flow-primary" disabled={locked||!outfit} onClick={submit}>{locked?'Preparing…':'Create portrait'}</button><small className="english-flow-note">Choosing an outfit does not start AI processing.</small>
   </>}{error&&<p role="alert">{error}</p>}
  </div></div>
 </section></div>;
}
