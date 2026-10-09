import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './studio-photo-guide.css';
export function StudioPhotoGuide(){
 const [open,setOpen]=useState(false),trigger=useRef(null),close=useRef(null);
 useEffect(()=>{if(!open)return;const previous=document.activeElement;close.current?.focus();const key=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false)}if(e.key==='Tab'){e.preventDefault();close.current?.focus()}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus()}},[open]);
 return <><button ref={trigger} type="button" className="studio-photo-guide-trigger" aria-label="ดูตัวอย่างรูปที่ถูกต้อง" title="ตัวอย่างรูปที่ถูกต้อง" onClick={()=>setOpen(true)}>?</button>{open&&createPortal(<div className="studio-photo-guide-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="studio-photo-guide-dialog" role="dialog" aria-modal="true" aria-label="ตัวอย่างรูปที่ถูกต้อง"><button ref={close} type="button" className="studio-photo-guide-close" aria-label="ปิดตัวอย่าง" onClick={()=>setOpen(false)}>×</button><img src="/assets/idpromth-photo-guide.svg" alt="คู่มือรูปถ่าย แสดงตัวอย่างรูปที่ถูกต้องและรูปที่อาจประมวลผลไม่สมบูรณ์"/></section></div>,document.body)}</>;
}
