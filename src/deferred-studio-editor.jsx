import React,{useEffect,useState} from 'react';
import {interfaceText} from './english-preview.js';
import {withDeadline} from './async-deadline.js';
import {loadStudioEditor} from './studio-editor-import.js';
let readyEditor=null;
export function StudioEditor(props){
 const [Editor,setEditor]=useState(()=>readyEditor),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(Editor)return;
  let active=true;setFailed(false);
  withDeadline(loadStudioEditor,{timeoutMs:30000,message:'เปิดงานไม่สำเร็จ',code:'STUDIO_IMPORT_TIMEOUT'}).then(module=>{
   readyEditor=module.StudioEditor;if(active)setEditor(()=>readyEditor);
  }).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};
 },[Editor,attempt]);
 if(Editor)return <Editor {...props}/>;
 return <main className="idstudio studio-starting" aria-busy={!failed}>
  <p role="status">{interfaceText(failed?'เปิดงานไม่สำเร็จ':'กำลังเปิด Studio…')}</p>
  {failed&&<button type="button" onClick={()=>setAttempt(value=>value+1)}>{interfaceText('ลองอีกครั้ง')}</button>}
 </main>;
}
