import React,{useLayoutEffect,useState} from 'react';
import {ProcessingIndicator} from './processing-indicator.jsx';
import './studio-image-processing.css';

// Keep the processing UI on the rendered photograph, not in a modal.
export function StudioImageProcessing({stageRef,canvasRef,viewKey,progress,title,description,onCancel,cancelDisabled=false}){
 const [bounds,setBounds]=useState(null);
 useLayoutEffect(()=>{
  let frame=0;
  const update=()=>{
   const stage=stageRef.current,canvas=canvasRef.current;
   if(!stage||!canvas)return;
   const outer=stage.getBoundingClientRect(),inner=canvas.getBoundingClientRect();
   const left=Math.max(0,inner.left-outer.left),top=Math.max(0,inner.top-outer.top);
   const right=Math.min(outer.width,inner.right-outer.left),bottom=Math.min(outer.height,inner.bottom-outer.top);
   if(right-left>20&&bottom-top>20){
    const next={left:Math.round(left),top:Math.round(top),width:Math.round(right-left),height:Math.round(bottom-top)};
    setBounds(previous=>previous&&Object.keys(next).every(k=>previous[k]===next[k])?previous:next);
   }
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)};
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
  if(stageRef.current)observer?.observe(stageRef.current);
  if(canvasRef.current)observer?.observe(canvasRef.current);
  schedule();window.addEventListener('resize',schedule);
  return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule)};
 },[stageRef,canvasRef,viewKey]);
 return <div className="studio-image-processing" style={bounds||{inset:0}} role="status" aria-live="polite" aria-busy={Number(progress)<100} onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerCancel={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
  <ProcessingIndicator value={progress}/>
  <strong className="studio-image-processing-title">{title}</strong>
  {description&&<span className="studio-image-processing-stage">{description}</span>}
  {onCancel&&<button type="button" className="studio-image-processing-cancel" disabled={cancelDisabled} onClick={e=>{e.stopPropagation();onCancel()}}>ยกเลิก</button>}
 </div>;
}
