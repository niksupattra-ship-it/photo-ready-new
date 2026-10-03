import React,{useEffect,useRef,useState} from 'react';

export const PHOTO_SIZES=[
 {id:'original',label:'ขนาดเดิม'},
 {id:'1-inch',label:'1 นิ้ว',width:25,height:33},
 {id:'1.5-inch',label:'1.5 นิ้ว',width:30,height:40},
 {id:'2-inch',label:'2 นิ้ว',width:40,height:53},
 {id:'2.5-inch',label:'2.5 นิ้ว',width:48,height:63},
 {id:'3-inch',label:'3 นิ้ว',width:62,height:78},
 {id:'2x2-inch',label:'2 × 2 นิ้ว',width:51,height:51},
 {id:'33x48',label:'33 × 48 มม.',width:33,height:48},
 {id:'35x45',label:'35 × 45 มม.',width:35,height:45}
];
export const DEFAULT_PHOTO_CROP={sizeId:'original',x:.5,y:.5,zoom:1};
export function photoCropRect(width,height,size,crop){
 const ratio=size.width/size.height;
 let w=Math.min(width,height*ratio),h=w/ratio;
 const zoom=Math.max(1,Math.min(3,Number(crop.zoom)||1));w/=zoom;h/=zoom;
 const x=Math.max(w/2,Math.min(width-w/2,(Number.isFinite(crop.x)?crop.x:.5)*width));
 const y=Math.max(h/2,Math.min(height-h/2,(Number.isFinite(crop.y)?crop.y:.5)*height));
 return {x:x-w/2,y:y-h/2,width:w,height:h};
}
function loadPhoto(blob){return new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(blob),img=new Image();
 img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
 img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('เปิดภาพสำหรับครอปไม่สำเร็จ'))};img.src=url;
})}
// PNG physical dimensions: 300 pixels/inch, matching the millimetre presets.
export async function withPrintResolution(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),chunk=new Uint8Array(21),view=new DataView(chunk.buffer);
 view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,11811);view.setUint32(12,11811);chunk[16]=1;
 let crc=0xffffffff;for(const byte of chunk.subarray(4,17)){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}view.setUint32(17,(crc^0xffffffff)>>>0);
 return new Blob([bytes.subarray(0,33),chunk,bytes.subarray(33)],{type:'image/png'});
}
export async function cropPhotoForDownload(blob,crop){
 const size=PHOTO_SIZES.find(s=>s.id===crop.sizeId);
 if(!size?.width)return blob; // Preserve the existing default output byte for byte.
 const img=await loadPhoto(blob),rect=photoCropRect(img.naturalWidth,img.naturalHeight,size,crop),canvas=document.createElement('canvas');
 canvas.width=Math.round(size.width/25.4*300);canvas.height=Math.round(size.height/25.4*300);
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.drawImage(img,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);
 const out=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพครอปไม่สำเร็จ')),'image/png'));
 return withPrintResolution(out);
}

export function PhotoSizeEditor({blob,value,trial,onApply,onClose}){
 const [crop,setCrop]=useState({...value}),[img,setImg]=useState(null),[error,setError]=useState('');
 const canvasRef=useRef(null),dialogRef=useRef(null),dragRef=useRef(null);
 const size=PHOTO_SIZES.find(s=>s.id===crop.sizeId)||PHOTO_SIZES[0];
 useEffect(()=>{let active=true;loadPhoto(blob).then(image=>{if(active)setImg(image)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[blob]);
 useEffect(()=>{const before=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialogRef.current?.focus();return()=>{document.body.style.overflow=overflow;before?.focus?.()}},[]);
 useEffect(()=>{
  if(!img||!canvasRef.current)return;const canvas=canvasRef.current;
  const rect=size.width?photoCropRect(img.naturalWidth,img.naturalHeight,size,crop):{x:0,y:0,width:img.naturalWidth,height:img.naturalHeight};
  canvas.width=Math.round(Math.min(1000,rect.width));canvas.height=Math.round(canvas.width*rect.height/rect.width);
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,rect.x,rect.y,rect.width,rect.height,0,0,canvas.width,canvas.height);
 },[img,size,crop]);
 const move=e=>{
  const drag=dragRef.current;if(!drag||!img||!size.width)return;
  const rect=photoCropRect(img.naturalWidth,img.naturalHeight,size,drag.crop);
  const next={...drag.crop,x:drag.crop.x-(e.clientX-drag.x)*rect.width/drag.width/img.naturalWidth,y:drag.crop.y-(e.clientY-drag.y)*rect.height/drag.height/img.naturalHeight};
  const bounded=photoCropRect(img.naturalWidth,img.naturalHeight,size,next);
  setCrop({...next,x:(bounded.x+bounded.width/2)/img.naturalWidth,y:(bounded.y+bounded.height/2)/img.naturalHeight});
 };
 const zoom=n=>setCrop(c=>({...c,zoom:Math.max(1,Math.min(3,n))}));
 const keyDown=e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}if(e.key==='Tab'){const nodes=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')];const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
 return <div className="photo-size-overlay" onPointerDown={e=>{e.stopPropagation();if(e.target===e.currentTarget)onClose()}}>
  <section ref={dialogRef} className="photo-size-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-size-title" tabIndex={-1} onKeyDown={keyDown}>
   <header><div><h2 id="photo-size-title">ขนาดรูป</h2><p>ตัวอย่างก่อนดาวน์โหลด</p></div><button type="button" className="photo-size-close" aria-label="ปิดเลือกขนาดรูป" onClick={onClose}>×</button></header>
   <div className="photo-size-body"><div className="photo-size-preview">
    {error?<p role="alert">{error}</p>:!img?<p role="status">กำลังเตรียมภาพ…</p>:<div className={'photo-size-canvas-wrap '+(size.width?'croppable':'')} style={{'--photo-crop-ratio':size.width?size.width/size.height:img.naturalWidth/img.naturalHeight,aspectRatio:size.width?`${size.width}/${size.height}`:`${img.naturalWidth}/${img.naturalHeight}`}} onPointerDown={e=>{if(!size.width||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const box=e.currentTarget.getBoundingClientRect();dragRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,width:box.width,height:box.height,crop:{...crop}}}} onPointerMove={move} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}} onLostPointerCapture={()=>{dragRef.current=null}}>
     <canvas ref={canvasRef} aria-label="ตัวอย่างรูปตามขนาดที่เลือก"/>{size.width&&<div className="photo-size-guides" aria-hidden="true"/>}{trial&&<div className="trial-watermark-grid" aria-hidden="true">{Array.from({length:64},(_,i)=><span key={i}>ตัวอย่าง IDพร้อม</span>)}</div>}
    </div>}
   </div><div className="photo-size-controls"><div className="photo-size-options" role="group" aria-label="เลือกขนาดรูป">{PHOTO_SIZES.map(s=><button type="button" key={s.id} className={crop.sizeId===s.id?'selected':''} aria-pressed={crop.sizeId===s.id} onClick={()=>setCrop({...DEFAULT_PHOTO_CROP,sizeId:s.id})}><strong>{s.label}</strong>{s.width&&<small>{s.width} × {s.height} มม.</small>}</button>)}</div>
    {size.width?<><p className="photo-size-hint">ลากรูปเพื่อจัดตำแหน่งในกรอบ</p><div className="photo-size-zoom"><button type="button" aria-label="ลดซูมครอป" disabled={crop.zoom<=1} onClick={()=>zoom(crop.zoom-.1)}>−</button><input aria-label="ซูมครอป" type="range" min="1" max="3" step=".01" value={crop.zoom} onChange={e=>zoom(Number(e.target.value))}/><button type="button" aria-label="เพิ่มซูมครอป" disabled={crop.zoom>=3} onClick={()=>zoom(crop.zoom+.1)}>+</button><output>{Math.round(crop.zoom*100)}%</output></div><button type="button" className="photo-size-reset" onClick={()=>setCrop({...DEFAULT_PHOTO_CROP,sizeId:size.id})}>จัดตำแหน่งใหม่</button></>:<p className="photo-size-hint">ใช้รูปขนาดเดิมโดยไม่ครอป</p>}
   </div></div><footer><button type="button" onClick={onClose}>ยกเลิก</button><button type="button" className="photo-size-apply" disabled={!img||!!error} onClick={()=>onApply(crop)}>ใช้ขนาดนี้</button></footer>
  </section>
 </div>;
}
