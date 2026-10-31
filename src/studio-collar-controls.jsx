import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {collarControlValues,collarSpacingValue} from './collar-pin-controls.js';
import './studio-collar-controls.css';

const sideNames={left:'เข็มซ้าย',right:'เข็มขวา',both:'เข็มทั้งคู่'};
function Icon({name}){
 const paths={pin:'m12 3 5 7-2 9h-6l-2-9 5-7Zm0 5v7m-2-2h4',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',center:'M12 3v4m0 10v4M3 12h4m10 0h4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',zoom:'M16 16l5 5M10 6v8m-4-4h8M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',reset:'M4 9V3m0 6h6M4 9a8 8 0 1 1 0 7',link:'m10 14 4-4m-6 5-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',close:'m6 6 12 12M18 6 6 18'};
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

export function StudioCollarControls({layer,side,onSide,disabled,independent,getPreviewData,onAdjust,onNudge,onSpacing,onReset,onCenter,onPreviewStart,onPreviewMove,onPreviewEnd,revision}){
 const [step,setStep]=useState(1),[expanded,setExpanded]=useState(false),[liveLayer,setLiveLayer]=useState(layer);
 const previewRef=useRef(null),largeRef=useRef(null),dialogRef=useRef(null),drag=useRef(null),frame=useRef(null),callbacks=useRef(null);
 const selected=independent&&['left','right','both'].includes(side)?side:independent?'left':'both';
 const name=sideNames[selected],values=collarControlValues(liveLayer.id===layer.id?liveLayer:layer,selected);
 const spacing=collarSpacingValue(liveLayer.id===layer.id?liveLayer:layer);
 callbacks.current={getPreviewData,onSide,onPreviewStart,onPreviewMove,onPreviewEnd,selected,disabled,independent};
 useEffect(()=>setLiveLayer(layer),[layer]);
 const paint=target=>{
  const data=callbacks.current.getPreviewData();if(!target||!data?.canvas)return;
  const rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const ratio=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio),crop=drag.current?.crop||data.crop;
  if(target.width!==w)target.width=w;if(target.height!==h)target.height=h;
  const ctx=target.getContext('2d');ctx.clearRect(0,0,w,h);ctx.fillStyle='#eef1f8';ctx.fillRect(0,0,w,h);
  ctx.drawImage(data.canvas,crop.x/900*data.canvas.width,crop.y/1200*data.canvas.height,crop.w/900*data.canvas.width,crop.h/1200*data.canvas.height,0,0,w,h);
  for(const pin of data.pins){
   if(callbacks.current.selected!=='both'&&callbacks.current.selected!==pin.side)continue;
   const box=pin.box,x=(box.x-crop.x)/crop.w*w,y=(box.y-crop.y)/crop.h*h,bw=box.w/crop.w*w,bh=box.h/crop.h*h;
   ctx.strokeStyle='#7044ed';ctx.lineWidth=1.5*ratio;ctx.strokeRect(x-3*ratio,y-3*ratio,bw+6*ratio,bh+6*ratio);
  }
 };
 const refresh=()=>{if(frame.current!==null)return;frame.current=requestAnimationFrame(()=>{frame.current=null;const data=callbacks.current.getPreviewData();if(data?.layer)setLiveLayer(data.layer);paint(previewRef.current);paint(largeRef.current)})};
 useEffect(()=>{
  const source=getPreviewData()?.canvas;source?.addEventListener('studio-paint',refresh);refresh();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(refresh):null;
  for(const canvas of [previewRef.current,largeRef.current])if(canvas)observer?.observe(canvas);
  return()=>{source?.removeEventListener('studio-paint',refresh);observer?.disconnect();if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null};
 },[layer.id,side,disabled,expanded,revision]);
 useEffect(()=>{if(expanded)dialogRef.current?.showModal();else dialogRef.current?.close()},[expanded]);
 useEffect(()=>()=>{if(drag.current)callbacks.current.onPreviewEnd()},[]);
 const closePreview=()=>{dialogRef.current?.close();setExpanded(false)};
 const previewPoint=(event,crop)=>{const r=event.currentTarget.getBoundingClientRect();return {x:crop.x+(event.clientX-r.left)/r.width*crop.w,y:crop.y+(event.clientY-r.top)/r.height*crop.h}};
 const startDrag=event=>{
  const current=callbacks.current;if(event.button!==0||current.disabled)return;
  const data=current.getPreviewData();if(!data)return;
  const point=previewPoint(event,data.crop),tolerance=data.crop.w/event.currentTarget.clientWidth*8;
  const hit=data.pins.find(pin=>point.x>=pin.box.x-tolerance&&point.x<=pin.box.x+pin.box.w+tolerance&&point.y>=pin.box.y-tolerance&&point.y<=pin.box.y+pin.box.h+tolerance);
  if(!hit)return;
  const next=current.selected==='both'||!current.independent?'both':hit.side;
  if(current.onPreviewStart()===false)return;
  current.onSide(next);event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={id:event.pointerId,crop:data.crop,point,layer:data.layer,side:next};refresh();
 };
 const moveDrag=event=>{const start=drag.current;if(!start||start.id!==event.pointerId||callbacks.current.disabled)return;event.preventDefault();const point=previewPoint(event,start.crop);callbacks.current.onPreviewMove(start.layer,start.side,{x:point.x-start.point.x,y:point.y-start.point.y})};
 const finishDrag=event=>{if(!drag.current||drag.current.id!==event.pointerId)return;drag.current=null;callbacks.current.onPreviewEnd();refresh()};
 const previewEvents={onPointerDown:startDrag,onPointerMove:moveDrag,onPointerUp:finishDrag,onPointerCancel:finishDrag,onLostPointerCapture:finishDrag};
 const field=(field,label,unit,min,max,increment=1)=><NumberStepper label={name+' '+label} value={values[field]} unit={unit} min={min} max={max} step={increment} onValue={value=>onAdjust(selected,field,value)}/>;
 return <fieldset className="studio-collar-controls" disabled={disabled}>
  <legend><Icon name="pin"/>เข็มปกคอ</legend>
  <div className="collar-side-tabs" aria-label="เลือกเข็มปกคอ">{[['left','ซ้าย'],['both','ทั้งคู่'],['right','ขวา']].map(([id,label])=><button type="button" key={id} disabled={id!=='both'&&!independent} aria-pressed={selected===id} onClick={()=>onSide(id)}>{label}</button>)}</div>
  <p className="collar-side-hint">ซ้าย–ขวาตามภาพ</p>
  <div className="collar-preview-wrap"><canvas ref={previewRef} role="img" aria-label="ภาพขยายตำแหน่งเข็มปกคอ" {...previewEvents}/><button type="button" className="collar-preview-zoom" aria-label="ขยายภาพตัวอย่างเข็ม" onClick={()=>setExpanded(true)}><Icon name="zoom"/></button></div>
  <p className="collar-active-name">กำลังปรับ{name}</p>
  {!independent&&<p className="collar-side-hint">ปรับทั้งคู่ได้ · คืนรูปก่อนบิดเพื่อปรับแยกข้าง</p>}
  <section className="collar-position-section" aria-label="ตำแหน่งเข็ม"><h3>ตำแหน่ง</h3><div className="collar-position-grid">
   <div className="collar-direction-pad">{[['up','ขึ้น',0,-1],['left','ซ้าย',-1,0],['center','คืนตำแหน่ง',0,0],['right','ขวา',1,0],['down','ลง',0,1]].map(([id,label,x,y])=><button type="button" key={id} className={'collar-direction-'+id} aria-label={label+' '+name} onClick={()=>id==='center'?onCenter(selected):onNudge(selected,x*step,y*step)}><Icon name={id}/></button>)}</div>
   <div className="collar-axis-fields"><div><span>X</span>{field('x','X','px',-900,900,step)}</div><div><span>Y</span>{field('y','Y','px',-1200,1200,step)}</div></div>
  </div><div className="collar-step-choice"><span>ขยับครั้งละ</span><div aria-label="ระยะขยับเข็ม">{[1,5].map(value=><button type="button" key={value} aria-pressed={step===value} onClick={()=>setStep(value)}>{value} px</button>)}</div></div></section>
  <div className="collar-size-rotation"><div><h3>ขนาด</h3>{field('scale','ขนาด','%',10,300)}</div><div><h3>หมุน</h3>{field('rotation','หมุน','°',-180,180)}</div></div>
  <div className="collar-spacing-row"><span>ระยะห่างทั้งคู่ <Icon name="link"/></span><fieldset disabled={!independent}><NumberStepper label="ระยะห่างเข็มทั้งคู่" value={spacing} unit="px" min={-900} max={900} step={step} onValue={onSpacing}/></fieldset></div>
  <button type="button" className="collar-reset" onClick={()=>onReset(selected)}><Icon name="reset"/>คืนค่า{name}</button>
  {expanded&&createPortal(<dialog ref={dialogRef} className="studio-collar-preview-dialog" aria-label={'ตำแหน่ง'+name} onCancel={e=>{e.preventDefault();closePreview()}} onClick={e=>{if(e.target===e.currentTarget)closePreview()}}><div><header><strong>ตำแหน่ง{name}</strong><button type="button" aria-label="ปิดภาพขยายเข็ม" onClick={closePreview}><Icon name="close"/></button></header><canvas ref={largeRef} role="img" aria-label="ภาพขยายเข็มสำหรับปรับตำแหน่ง" {...previewEvents}/><p>ลากเข็มเพื่อปรับตำแหน่ง · ซ้าย–ขวาตามภาพ</p></div></dialog>,document.body)}
 </fieldset>;
}
