import React,{useLayoutEffect,useState} from 'react';

// These are editor controls above the visible photo, never canvas/export pixels.
export function EnglishPhotoActions({stageRef,canvasRef,drawerRef,toolbarRef,viewKey,busy,disabled,onCreate,onCancel}){
 const [bounds,setBounds]=useState(null);
 useLayoutEffect(()=>{
  let frame=0;
  const update=()=>{
   const stage=stageRef.current,canvas=canvasRef.current;
   if(!stage||!canvas)return;
   const outer=stage.getBoundingClientRect(),photo=canvas.getBoundingClientRect();
   const left=Math.max(outer.left,photo.left,0),top=Math.max(outer.top,photo.top,0);
   const right=Math.min(outer.right,photo.right,window.innerWidth);
   let bottom=Math.min(outer.bottom,photo.bottom,window.innerHeight);
   for(const ref of [drawerRef,toolbarRef]){
    const blocked=ref.current?.getBoundingClientRect();
    if(blocked&&blocked.width>0&&blocked.left<right&&blocked.right>left&&blocked.top>top&&blocked.top<bottom)bottom=blocked.top;
   }
   const next=right-left>40&&bottom-top>60?{left:left-outer.left,top:top-outer.top,width:right-left,height:bottom-top}:null;
   setBounds(previous=>previous&&next&&Object.keys(next).every(key=>Math.abs(previous[key]-next[key])<.5)?previous:next);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)};
  const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
  for(const ref of [stageRef,canvasRef,drawerRef,toolbarRef])if(ref.current)resize?.observe(ref.current);
  const transform=typeof MutationObserver!=='undefined'?new MutationObserver(schedule):null;
  if(canvasRef.current)transform?.observe(canvasRef.current,{attributes:true,attributeFilter:['style','width','height']});
  schedule();window.addEventListener('resize',schedule);
  return()=>{cancelAnimationFrame(frame);resize?.disconnect();transform?.disconnect();window.removeEventListener('resize',schedule)};
 },[stageRef,canvasRef,drawerRef,toolbarRef,viewKey]);
 const stop=event=>event.stopPropagation();
 return bounds&&<div className="english-photo-actions" style={bounds}>
  <div className="english-inline-ai" role="group" aria-label="Create selected portrait" onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onPointerCancel={stop} onWheel={stop} onClick={stop}>
   <button type="button" disabled={disabled||busy} onClick={onCreate}>Create</button>
   <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
  </div>
 </div>;
}
