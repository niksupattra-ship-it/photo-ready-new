import React,{useRef,useState} from 'react';
import './result-insignia-drag.css';

// Edit handles stay inside the finished image, but every change is committed
// to the original Studio insignia layer and therefore the real PNG/PDF export.
// Pointer coordinates are normalized to the Studio 900x1200 canvas.
const W=900,H=1200,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function ResultInsigniaDrag({handles=[],onStart,onTransform,onEnd,busy=false}){
 const area=useRef(null),pointers=useRef(new Map()),gesture=useRef(null);
 const [active,setActive]=useState(null);
 const rect=()=>area.current?.getBoundingClientRect();
 const locate=e=>{const r=rect();return r?{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}:null};
 const hit=p=>{
  const candidates=[...handles].reverse();
  return candidates.find(({box})=>{
   if(!box)return false;
   const margin=21;return p.x>=box.x-margin&&p.y>=box.y-margin&&p.x<=box.x+box.w+margin&&p.y<=box.y+box.h+margin;
  })||null;
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
  const target=selected?handles.find(h=>(h.id||h.kind)===selected.id):hit(p);
  if(!target)return;
  if(!gesture.current){
   const grip=e.target.closest?.('[data-insignia-resize]');
   const mode=grip?'resize':'move';
   gesture.current={id:target.id||target.kind,mode,last:null};
   setActive(target.id||target.kind);onStart?.(target.id||target.kind);
  }
  e.preventDefault();e.stopPropagation();
  pointers.current.set(e.pointerId,p);
  e.currentTarget.setPointerCapture?.(e.pointerId);
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
  const scaleRatio=multi&&before.dist>8?clamp(after.dist/before.dist,.65,1.5)
   :g.mode==='resize'?clamp(1+((after.center.x-before.center.x)+(after.center.y-before.center.y))*0.009,.7,1.3):1;
  const dx=multi||g.mode==='move'?after.center.x-before.center.x:0;
  const dy=multi||g.mode==='move'?after.center.y-before.center.y:0;
  if(Math.abs(dx)+Math.abs(dy)>.01||Math.abs(scaleRatio-1)>.001)onTransform?.(g.id,{dx,dy,scaleRatio});
  g.last=after;
 };
 const finish=e=>{
  if(!pointers.current.has(e.pointerId))return;
  e.stopPropagation();pointers.current.delete(e.pointerId);
  try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
  if(pointers.current.size)gesture.current.last=step();
  else{const g=gesture.current;gesture.current=null;if(g)onEnd?.(g.id)}
 };
 const cancel=()=>{
  if(gesture.current){const g=gesture.current;gesture.current=null;pointers.current.clear();onEnd?.(g.id)}
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
      {active===(id||kind)&&<span className="thai-result-insignia-grip" data-insignia-resize="true" role="img" aria-label="ลากเพื่อย่อขยายเครื่องหมาย">↘</span>}
    </div>;
   })}
 </div>;
}
