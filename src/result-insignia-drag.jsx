import React,{useEffect,useRef,useState} from 'react';
import {easyInsigniaHit,easyInsigniaGestureMode} from './result-insignia-hit.js';
import './result-insignia-drag.css';

// Edit handles stay inside the finished image, but every change is committed
// to the original Studio insignia layer and therefore the real PNG/PDF export.
// Pointer coordinates are normalized to the Studio 900x1200 canvas.
const W=900,H=1200,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function ResultInsigniaDrag({handles=[],onStart,onTransform,onEnd,busy=false}){
 const area=useRef(null),pointers=useRef(new Map()),gesture=useRef(null);
 const pending=useRef(null),frameId=useRef(null),transformRef=useRef(onTransform);
 transformRef.current=onTransform;
 const [active,setActive]=useState(null);
 // Keep the actual layer transforms, but draw no more than once per screen frame.
 const flush=()=>{
  if(frameId.current!==null){cancelAnimationFrame(frameId.current);frameId.current=null}
  const batch=pending.current;pending.current=null;
  if(batch)transformRef.current?.(batch.id,{dx:batch.dx,dy:batch.dy,scaleRatio:batch.scaleRatio});
 };
 const schedule=(id,{dx,dy,scaleRatio})=>{
  if(pending.current&&pending.current.id!==id)flush();
  if(!pending.current)pending.current={id,dx:0,dy:0,scaleRatio:1};
  pending.current.dx+=dx;pending.current.dy+=dy;pending.current.scaleRatio*=scaleRatio;
  if(frameId.current===null)frameId.current=requestAnimationFrame(()=>{
   frameId.current=null;
   const batch=pending.current;pending.current=null;
   if(batch)transformRef.current?.(batch.id,{dx:batch.dx,dy:batch.dy,scaleRatio:batch.scaleRatio});
  });
 };
 useEffect(()=>()=>{if(frameId.current!==null)cancelAnimationFrame(frameId.current)},[]);
 const rect=()=>area.current?.getBoundingClientRect();
 const locate=e=>{const r=rect();return r?{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}:null};
 const hit=p=>{
  const r=rect();
  return easyInsigniaHit(handles,p,r?.width,r?.height);
 };
 const step=()=>{
  const g=gesture.current;if(!g||!pointers.current.size)return null;
  const points=[...pointers.current.values()];
  return {center:points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0}),
   dist:points.length>=2?distance(points[0],points[1]):0};
 };
 const begin=e=>{
  if(busy)return;
  const p=locate(e);if(!p)return;
  const selected=gesture.current;
  // The corner grip extends beyond a small pin's image box, especially on
  // mobile. Resolve its owning marker first rather than rejecting the touch.
  const grip=e.target.closest?.('[data-insignia-resize]');
  const owningId=grip?.closest?.('[data-kind]')?.dataset.kind;
  const target=selected?handles.find(h=>(h.id||h.kind)===selected.id):
   owningId?handles.find(h=>(h.id||h.kind)===owningId):hit(p);
  if(!target)return;
  if(!gesture.current){
   const mode=easyInsigniaGestureMode(Boolean(grip),p,target.box);
   gesture.current={id:target.id||target.kind,mode,last:null,center:{
    x:target.box.x+target.box.w/2,y:target.box.y+target.box.h/2
   }};
   setActive(target.id||target.kind);onStart?.(target.id||target.kind);
  }
  e.preventDefault();e.stopPropagation();
  pointers.current.set(e.pointerId,p);
  try{e.currentTarget.setPointerCapture?.(e.pointerId)}catch{ /* Older touch engines. */ }
  gesture.current.last=step();
 };
 const move=e=>{
  const g=gesture.current;if(!g||!pointers.current.has(e.pointerId))return;
  const p=locate(e);if(!p)return;
  e.preventDefault();e.stopPropagation();
  const before=g.last;
  pointers.current.set(e.pointerId,p);
  const after=step();if(!before||!after){g.last=after;return}
  const multi=pointers.current.size>=2;
  // Match Studio shape-scale: the selected corner changes the entire asset
  // uniformly by its DISTANCE FROM THE ASSET CENTER. Dragging toward the
  // center shrinks; dragging away enlarges (unlike the old diagonal arrow).
  const studioDistance=p=>distance(p,g.center);
  const scaleRatio=multi&&before.dist>8?clamp(after.dist/before.dist,.65,1.5)
   :g.mode==='resize'&&studioDistance(before.center)>4
    ?clamp(studioDistance(after.center)/studioDistance(before.center),.7,1.3):1;
  const dx=multi||g.mode==='move'?after.center.x-before.center.x:0;
  const dy=multi||g.mode==='move'?after.center.y-before.center.y:0;
  if(Math.abs(dx)+Math.abs(dy)>.01||Math.abs(scaleRatio-1)>.001)schedule(g.id,{dx,dy,scaleRatio});
  g.last=after;
 };
 const finish=e=>{
  if(!pointers.current.has(e.pointerId))return;
  e.stopPropagation();pointers.current.delete(e.pointerId);
  try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
  if(pointers.current.size)gesture.current.last=step();
  else{const g=gesture.current;flush();gesture.current=null;if(g)onEnd?.(g.id)}
 };
 if(!handles.length)return null;
 return <div className="thai-result-insignia-interaction" ref={area}
   aria-label="ลากเครื่องหมายบนรูป หรือจับมุมเพื่อย่อขยาย"
   onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
   onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))finish(e)}}>
   {handles.map(({kind,id,box})=>{
    const left=clamp(box.x/W*100,0,100),top=clamp(box.y/H*100,0,100);
    const width=clamp(box.w/W*100,1,100-left),height=clamp(box.h/H*100,1,100-top);
    return <div key={id||kind} className={'thai-result-insignia-handle'+(active===(id||kind)?' active':'')}
      data-kind={id||kind} style={{left:left+'%',top:top+'%',width:width+'%',height:height+'%'}}>
      {active===(id||kind)&&['nw','ne','se','sw'].map((corner,index)=>
       <span key={corner} className={'thai-result-insignia-grip thai-result-insignia-corner-'+corner}
        data-insignia-resize={corner} role="button" tabIndex={0}
        aria-label={'ปรับขนาดเครื่องหมายมุม '+(index+1)}
        onKeyDown={e=>{
         if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
         e.preventDefault();e.stopPropagation();
         const pinId=id||kind,ratio=['ArrowUp','ArrowRight'].includes(e.key)?1.025:.975;
         onStart?.(pinId);onTransform?.(pinId,{dx:0,dy:0,scaleRatio:ratio});onEnd?.(pinId);
        }}>
        <span className="thai-result-insignia-studio-dot" aria-hidden="true"/>
       </span>
      )}
    </div>;
   })}
 </div>;
}
