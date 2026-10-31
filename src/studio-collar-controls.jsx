import React,{useEffect,useRef,useState} from 'react';
import {collarControlValues,collarSpacingValue} from './collar-pin-controls.js';
import './studio-collar-controls.css';

const sideNames={left:'เข็มซ้าย',right:'เข็มขวา',both:'เข็มทั้งคู่'};
function Icon({name}){
 const paths={pin:'m12 3 5 7-2 9h-6l-2-9 5-7Zm0 5v7m-2-2h4',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',center:'M12 3v4m0 10v4M3 12h4m10 0h4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',reset:'M4 9V3m0 6h6M4 9a8 8 0 1 1 0 7',link:'m10 14 4-4m-6 5-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'};
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
const display=value=>Number(value.toFixed(2)).toString();
function NumberStepper({label,value,unit,min,max,step=1,onValue}){
 const [draft,setDraft]=useState(display(value));
 const latest=useRef(value);
 useEffect(()=>{latest.current=value;setDraft(display(value))},[value]);
 const update=next=>{next=Math.max(min,Math.min(max,next));latest.current=next;setDraft(display(next));onValue(next)};
 const commit=event=>{const raw=event.currentTarget.value.trim(),next=raw===''?NaN:Number(raw);if(Number.isFinite(next))update(next);else{latest.current=value;setDraft(display(value))}};
 const adjust=direction=>update(Number((latest.current+direction*step).toFixed(4)));
 return <div className="collar-number-stepper">
  <button type="button" aria-label={'ลด '+label} disabled={value<=min} onClick={()=>adjust(-1)}>−</button>
  <span><input type="number" aria-label={label} min={min} max={max} step={step} value={draft} onChange={e=>{setDraft(e.target.value);const next=e.target.value.trim()===''?NaN:Number(e.target.value);if(Number.isFinite(next))latest.current=next}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}else if(e.key==='Escape'){e.preventDefault();e.currentTarget.value=display(value);setDraft(display(value));e.currentTarget.blur()}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();adjust(e.key==='ArrowUp'?1:-1)}}}/><span className="collar-number-unit">{unit}</span></span>
  <button type="button" aria-label={'เพิ่ม '+label} disabled={value>=max} onClick={()=>adjust(1)}>+</button>
 </div>;
}

export function StudioCollarControls({layer,side,onSide,disabled,independent,sceneCanvas,getLiveLayer,onAdjust,onNudge,onSpacing,onReset,onCenter}){
 const [step,setStep]=useState(1),[liveLayer,setLiveLayer]=useState(layer);
 const readLayer=useRef(getLiveLayer);readLayer.current=getLiveLayer;
 const selected=independent&&['left','right','both'].includes(side)?side:independent?'left':'both';
 const name=sideNames[selected],values=collarControlValues(liveLayer.id===layer.id?liveLayer:layer,selected);
 const spacing=collarSpacingValue(liveLayer.id===layer.id?liveLayer:layer);
 useEffect(()=>setLiveLayer(layer),[layer]);
 useEffect(()=>{
  let frame=null;
  const refresh=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;const current=readLayer.current();if(current)setLiveLayer(current)})};
  sceneCanvas?.addEventListener('studio-paint',refresh);refresh();
  return()=>{sceneCanvas?.removeEventListener('studio-paint',refresh);if(frame!==null)cancelAnimationFrame(frame)};
 },[sceneCanvas,layer.id]);
 const field=(field,label,unit,min,max,increment=1)=><NumberStepper label={name+' '+label} value={values[field]} unit={unit} min={min} max={max} step={increment} onValue={value=>onAdjust(selected,field,value)}/>;
 return <fieldset className="studio-collar-controls" disabled={disabled}>
  <legend><Icon name="pin"/>เข็มปกคอ</legend>
  <div className="collar-side-tabs" aria-label="เลือกเข็มปกคอ">{[['left','ซ้าย'],['both','ทั้งคู่'],['right','ขวา']].map(([id,label])=><button type="button" key={id} disabled={id!=='both'&&!independent} aria-pressed={selected===id} onClick={()=>onSide(id)}>{label}</button>)}</div>
  <p className="collar-side-hint">ซ้าย–ขวาตามภาพ</p>
  <p className="collar-active-name">กำลังปรับ{name}</p>
  {!independent&&<p className="collar-side-hint">ปรับทั้งคู่ได้ · คืนรูปก่อนบิดเพื่อปรับแยกข้าง</p>}
  <section className="collar-position-section" aria-label="ตำแหน่งเข็ม"><h3>ตำแหน่ง</h3><div className="collar-position-grid">
   <div className="collar-direction-pad">{[['up','ขึ้น',0,-1],['left','ซ้าย',-1,0],['center','คืนตำแหน่ง',0,0],['right','ขวา',1,0],['down','ลง',0,1]].map(([id,label,x,y])=><button type="button" key={id} className={'collar-direction-'+id} aria-label={label+' '+name} onClick={()=>id==='center'?onCenter(selected):onNudge(selected,x*step,y*step)}><Icon name={id}/></button>)}</div>
   <div className="collar-axis-fields"><div><span>X</span>{field('x','X','px',-900,900,step)}</div><div><span>Y</span>{field('y','Y','px',-1200,1200,step)}</div></div>
  </div><div className="collar-step-choice"><span>ขยับครั้งละ</span><div aria-label="ระยะขยับเข็ม">{[1,5].map(value=><button type="button" key={value} aria-pressed={step===value} onClick={()=>setStep(value)}>{value} px</button>)}</div></div></section>
  <div className="collar-size-rotation"><div><h3>ขนาด</h3>{field('scale','ขนาด','%',10,300)}</div><div><h3>หมุน</h3>{field('rotation','หมุน','°',-180,180)}</div></div>
  <div className="collar-spacing-row"><span>ระยะห่างทั้งคู่ <Icon name="link"/></span><fieldset disabled={!independent}><NumberStepper label="ระยะห่างเข็มทั้งคู่" value={spacing} unit="px" min={-900} max={900} step={step} onValue={onSpacing}/></fieldset></div>
  <button type="button" className="collar-reset" onClick={()=>onReset(selected)}><Icon name="reset"/>คืนค่า{name}</button>
 </fieldset>;
}
