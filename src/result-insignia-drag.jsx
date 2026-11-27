import React,{useEffect,useRef,useState} from 'react';
import {easyInsigniaHit} from './result-insignia-hit.js';
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
  // The arrow sits outside the artwork; resolve its owner before hit testing.
  const moveGrip=e.target.closest?.('[data-insignia-move]');
  const owningId=moveGrip?.closest?.('[data-kind]')?.dataset.kind;
  const target=selected?handles.find(h=>(h.id||h.kind)===selected.id):
   owningId?handles.find(h=>(h.id||h.kind)===owningId):hit(p);
  if(!target)return;
  if(!gesture.current){
   const mode='move';
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
  // One pointer only moves. Two fingers retain uniform pinch scaling.
  const scaleRatio=multi&&before.dist>8?clamp(after.dist/before.dist,.65,1.5)
   :1;
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
   aria-label="แตะเครื่องหมายแล้วลากลูกศรเพื่อย้าย ใช้สองนิ้วเพื่อย่อขยาย"
   onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
   onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))finish(e)}}>
   {handles.map(({kind,id,box})=>{
    const left=clamp(box.x/W*100,0,100),top=clamp(box.y/H*100,0,100);
    const width=clamp(box.w/W*100,1,100-left),height=clamp(box.h/H*100,1,100-top);
    return <div key={id||kind} className={'thai-result-insignia-handle'+(active===(id||kind)?' active':'')}
      data-kind={id||kind} style={{left:left+'%',top:top+'%',width:width+'%',height:height+'%'}}>
      {active===(id||kind)&&<button type="button"
       className={'thai-result-insignia-move-arrow'+(left+width>75?' on-left':'')}
       data-insignia-move="true" aria-label="ลากเพื่อย้ายเครื่องหมาย" title="ลากเพื่อย้าย"
       onKeyDown={e=>{
        const delta={ArrowUp:[0,-8],ArrowDown:[0,8],ArrowLeft:[-8,0],ArrowRight:[8,0]}[e.key];
        if(!delta)return;e.preventDefault();e.stopPropagation();const pinId=id||kind;
        onStart?.(pinId);onTransform?.(pinId,{dx:delta[0],dy:delta[1],scaleRatio:1});onEnd?.(pinId);
       }}>
       <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M2 12h20M9 5l3-3 3 3M19 9l3 3-3 3M15 19l-3 3-3-3M5 15l-3-3 3-3"/>
       </svg>
      </button>}

    </div>;
   })}
 </div>;
}
