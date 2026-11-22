import React,{forwardRef,useLayoutEffect,useRef} from 'react';
import {observeElementResize} from './browser-compat.js';
import './preview-watermark.css';

// Same logical 900x1200 grid in both views; never draw it into source pixels.
export const PreviewWatermark=forwardRef(function PreviewWatermark({className='',style,...props},ref){
 return <div ref={ref} className={'idprom-preview-watermark '+className} style={style} {...props}>{Array.from({length:27},(_,i)=><span key={i} style={{fontSize:34}}>ตัวอย่าง IDพร้อม</span>)}</div>;
});
export function FittedPreviewWatermark(){
 const ref=useRef(null);
 useLayoutEffect(()=>{
  const overlay=ref.current,parent=overlay?.parentElement,canvas=parent?.querySelector('canvas');
  if(!overlay||!parent||!canvas)return;
  const update=()=>{
   const r=canvas.getBoundingClientRect(),p=parent.getBoundingClientRect();
   Object.assign(overlay.style,{left:(r.left-p.left-parent.clientLeft)+'px',top:(r.top-p.top-parent.clientTop)+'px',transform:`scale(${r.width/900},${r.height/1200})`,visibility:r.width&&r.height?'visible':'hidden'});
  };
  update();const stop=observeElementResize(update,canvas,parent);
  window.addEventListener('resize',update);
  return()=>{stop();window.removeEventListener('resize',update)};
 },[]);
 return <PreviewWatermark ref={ref} style={{visibility:'hidden'}} aria-label="รูปตัวอย่างมีลายน้ำ"/>;
}
