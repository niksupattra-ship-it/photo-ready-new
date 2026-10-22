import React,{useEffect,useRef,useState} from 'react';
import './studio-background-color.css';
export function hsvHex(h,s,v){
 const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
 const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
export function hexHsv(hex){
 const [r,g,b]=hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 const h=!d?0:max===r?60*(((g-b)/d+6)%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
 return [h,max?d/max:0,max];
}
export function StudioBackgroundColor({initialColor='#FFFFFF',onPreview,onApply,onCancel}){
 const [hsv,setHsv]=useState(()=>hexHsv(initialColor)),[text,setText]=useState(initialColor),panel=useRef(null),square=useRef(null);
 const color=hsvHex(...hsv),valid=/^#[a-f\d]{6}$/i.test(text);
 useEffect(()=>{onPreview(color)},[color]);
 useEffect(()=>{const before=document.activeElement;panel.current?.focus();return()=>before?.focus?.()},[]);
 const update=next=>{setHsv(next);setText(hsvHex(...next))};
 const point=e=>{const r=square.current.getBoundingClientRect();update([hsv[0],Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),1-Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))])};
 const key=e=>{if(e.key==='Escape'){e.stopPropagation();onCancel()}if(e.key==='Tab'){const nodes=[...panel.current.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')],first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
 return <div className="studio-color-overlay" onClick={e=>{if(e.target===e.currentTarget)onCancel()}}><section ref={panel} tabIndex={-1} className="studio-color-panel" role="dialog" aria-modal="true" aria-labelledby="studio-color-title" onKeyDown={key}>
  <header><h2 id="studio-color-title">เลือกสีพื้นหลัง</h2><button type="button" aria-label="ปิดเลือกสี" onClick={onCancel}>×</button></header>
  <div ref={square} className="studio-color-square" style={{backgroundColor:hsvHex(hsv[0],1,1)}} role="group" aria-label="ความสดและความสว่างของสี" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);point(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))point(e)}}><span style={{left:hsv[1]*100+'%',top:(1-hsv[2])*100+'%'}}/></div>
  <label>โทนสี<input aria-label="โทนสี" className="studio-color-hue" type="range" min="0" max="359" step="1" value={hsv[0]} onChange={e=>update([Number(e.target.value),hsv[1],hsv[2]])}/></label>
  <div className="studio-color-sliders"><label>ความสด<input aria-label="ความสดของสี" type="range" min="0" max="100" value={Math.round(hsv[1]*100)} onChange={e=>update([hsv[0],Number(e.target.value)/100,hsv[2]])}/></label><label>ความสว่าง<input aria-label="ความสว่างของสี" type="range" min="0" max="100" value={Math.round(hsv[2]*100)} onChange={e=>update([hsv[0],hsv[1],Number(e.target.value)/100])}/></label></div>
  <label className="studio-color-hex"><span style={{backgroundColor:color}} aria-hidden="true"/>HEX<input aria-label="รหัสสี HEX" value={text} maxLength={7} spellCheck={false} aria-invalid={!valid} onChange={e=>{let next=e.target.value;if(next&&!next.startsWith('#'))next='#'+next;setText(next);if(/^#[a-f\d]{6}$/i.test(next))setHsv(hexHsv(next))}}/></label>
  <footer><button type="button" onClick={onCancel}>ยกเลิก</button><button type="button" disabled={!valid} onClick={()=>onApply(color)}>ใช้สีนี้</button></footer>
 </section></div>;
}
