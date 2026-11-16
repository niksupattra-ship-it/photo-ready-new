import React,{useEffect,useState} from 'react';
import {englishPreviewEnabled} from './english-preview.js';
import {createStudioModuleLoader} from './studio-module-loader.js';

const loader=createStudioModuleLoader(()=>import('./studio-editor.jsx'));
export const loadStudioEditor=()=>loader.load();

// Keep the parent's photo, project and payment state mounted during download or
// a network failure. Never refresh the page automatically to recover a chunk.
export function StudioEditor(props){
 const [module,setModule]=useState(()=>loader.current());
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  loadStudioEditor().then(value=>{if(active)setModule(value)},()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[attempt]);
 if(module){const Editor=module.StudioEditor;return <Editor {...props}/>}
 const english=englishPreviewEnabled();
 return <section className="studio-tools-loading" role="status" aria-live="polite" aria-busy={!failed} style={{minHeight:'70svh',display:'grid',placeItems:'center',padding:24,textAlign:'center'}}>
  <div><h1>ID{english?'PROM':'พร้อม'} Studio</h1>
   <p>{failed?(english?'Could not load editing tools. Check your connection and try again.':'โหลดเครื่องมือแต่งรูปไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'):(english?'Preparing editing tools…':'กำลังเตรียมเครื่องมือแต่งรูป…')}</p>
   {failed&&<button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1)}}>{english?'Try again':'ลองอีกครั้ง'}</button>}
   {props.onClose&&<button type="button" onClick={props.onClose}>{english?'Back to home':'กลับหน้าหลัก'}</button>}
  </div>
 </section>;
}
