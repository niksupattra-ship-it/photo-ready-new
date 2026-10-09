import React from 'react';
// One close control for every processing dialog and future processing tools.
export function ProcessingCloseButton({onClose,disabled=false}){
 return <button type="button" disabled={disabled} onClick={()=>{Promise.resolve().then(onClose).catch(()=>{})}} style={{position:'absolute',top:10,right:10,zIndex:2,minWidth:36,minHeight:36,margin:0,padding:'6px 9px'}} aria-label="ปิดและยกเลิกการประมวลผล">✕ ปิด</button>;
}
