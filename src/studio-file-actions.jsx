import React,{useEffect,useRef} from 'react';
function FileIcon({kind}){
 const paths={save:<><path d="M5 3h12l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,open:<><path d="M3 8V5h7l2 3h9v3M3 8h8l2 3h9l-3 10H3z"/></>,works:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,download:<><path d="M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5"/></>};
 return <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
export function StudioFileActions({disabled,onSave,onOpen,onWorks,onExport}){
 const menu=useRef(null);
 useEffect(()=>{const outside=e=>{if(menu.current&&!menu.current.contains(e.target))menu.current.open=false};const key=e=>{if(e.key==='Escape'&&menu.current)menu.current.open=false};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key)}},[]);
 useEffect(()=>{if(disabled&&menu.current)menu.current.open=false},[disabled]);
 return <div className="studio-file-actions">
  <div className="studio-project-actions" role="group" aria-label="จัดการโปรเจกต์">
   <button type="button" title="บันทึก" aria-label="บันทึก" disabled={disabled} onClick={onSave}><FileIcon kind="save"/></button>
   <button type="button" title="เปิดโปรเจกต์" aria-label="เปิดโปรเจกต์" disabled={disabled} onClick={onOpen}><FileIcon kind="open"/></button>
   <button type="button" title="งานที่บันทึก" aria-label="งานที่บันทึก" disabled={disabled} onClick={onWorks}><FileIcon kind="works"/></button>
  </div>
  <details ref={menu} className="studio-download-menu" onClickCapture={e=>{if(disabled){e.preventDefault();e.stopPropagation()}}}>
   <summary title="ดาวน์โหลดรูป" aria-label="ดาวน์โหลดรูป" aria-disabled={disabled}><FileIcon kind="download"/></summary>
   <div className="studio-download-formats" aria-label="เลือกรูปแบบไฟล์">{[['image/jpeg','JPG'],['image/png','PNG']].map(([type,name])=><button type="button" key={type} disabled={disabled} onClick={()=>{menu.current.open=false;void onExport(type)}}>{name}</button>)}</div>
  </details>
 </div>;
}
