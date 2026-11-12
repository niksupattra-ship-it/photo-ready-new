import {downloadPhotoRect,drawDownloadPhoto} from './download-photo-crop.js';
import React,{useEffect,useRef,useState} from 'react';
import {PHOTO_SIZES,ENGLISH_PHOTO_SIZES,DEFAULT_PHOTO_CROP,photoCropRect,cropPhotoForDownload} from './photo-size.jsx';
import {letterPhotoLayout,a4PhotoLayout,letterPhotoPdf} from './letter-photo-pdf.js';
import './english-download.css';
import {englishPreviewEnabled} from './english-preview.js';
import {withDeadline} from './async-deadline.js';
import {drawDownloadWatermark} from './download-choice.js';
const decode=async blob=>{const url=URL.createObjectURL(blob),im=new Image();try{im.src=url;await im.decode();return im}finally{URL.revokeObjectURL(url)}};
export async function prepareEnglishDownload(blob,choice,pixelScale=2){
 let photo=await cropPhotoForDownload(blob,choice,{pixelScale,type:'image/png'});
 if(!choice.freePosition&&choice.sizeId==='original'&&(choice.zoom||1)>1){const im=await decode(blob),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;try{const r=photoCropRect(c.width,c.height,{width:c.width,height:c.height},choice);c.getContext('2d').drawImage(im,r.x,r.y,r.width,r.height,0,0,c.width,c.height);photo=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not crop photo.')),'image/png'))}finally{c.width=c.height=1}}
 if(choice.format!=='pdf'){if(photo.type==='image/png')return photo;const im=await decode(photo),c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;try{c.getContext('2d').drawImage(im,0,0);return await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not create PNG.')),'image/png'))}finally{c.width=c.height=1}}
 const size=[...ENGLISH_PHOTO_SIZES,...PHOTO_SIZES].find(s=>s.id===choice.sizeId);if(!size?.width)throw Error('Choose a print size.');
 const image=await decode(photo),canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
 try{const x=canvas.getContext('2d');x.fillStyle='white';x.fillRect(0,0,canvas.width,canvas.height);x.drawImage(image,0,0);const jpeg=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create PDF.')),'image/jpeg',.98));return letterPhotoPdf(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height,(englishPreviewEnabled()?letterPhotoLayout:a4PhotoLayout)(size.width,size.height,choice.copies))}finally{canvas.width=canvas.height=1}
}
export function EnglishDownload({blob,value,pixelScale=2,onDownload,onClose,surfaceRef,watermarked=false,onAuthorize,onChange,autoSubmitKey=null}){
 const en=englishPreviewEnabled(),sizes=en?ENGLISH_PHOTO_SIZES:PHOTO_SIZES;
 const text=(english,thai)=>en?english:thai;
 const [crop,setCrop]=useState({...DEFAULT_PHOTO_CROP,...value,sizeId:sizes.some(s=>s.id===value?.sizeId)?value.sizeId:'original',freePosition:true}),[format,setFormat]=useState(value?.format==='pdf'?'pdf':'png'),[copies,setCopies]=useState(value?.copies||null),[adjust,setAdjust]=useState(false),[image,setImage]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const preview=useRef(null),dialog=useRef(null),drag=useRef(null),pointers=useRef(new Map()),pinch=useRef(null),submitting=useRef(false);
 const size=sizes.find(s=>s.id===crop.sizeId)||sizes[0];
 const layout=format==='pdf'&&size.width?(en?letterPhotoLayout:a4PhotoLayout)(size.width,size.height,copies):null;
 // Match cropPhotoForDownload: size presets use 300 DPI and the supplied pixelScale.
 // The unchanged original keeps its decoded pixel dimensions for either format.
 const photoPixels=image?(size.width?{
  width:Math.round(size.width/25.4*300)*pixelScale,
  height:Math.round(size.height/25.4*300)*pixelScale
 }:{width:image.naturalWidth,height:image.naturalHeight}):null;
 const changeRef=useRef(onChange);changeRef.current=onChange;
 useEffect(()=>{changeRef.current?.({...crop,format,copies:layout?.count??null})},[crop,format,layout?.count]);
 useEffect(()=>{let active=true;decode(blob).then(im=>{if(active)setImage(im)}).catch(()=>setError(text('Could not open this photo.','เปิดรูปไม่สำเร็จ')));return()=>{active=false}},[blob]);
 useEffect(()=>{const old=document.activeElement;dialog.current?.focus();return()=>{if(old?.isConnected)old.focus()}},[]);
 useEffect(()=>{
  if(!image||!preview.current)return;const c=preview.current,x=c.getContext('2d'),rect=downloadPhotoRect(image.naturalWidth,image.naturalHeight,size.width?size:{width:image.naturalWidth,height:image.naturalHeight},crop);
  const sheet=layout&&!adjust;c.width=sheet?Math.round(layout.width):Math.round(Math.min(600,rect.width));c.height=sheet?Math.round(layout.height):Math.round(c.width*rect.height/rect.width);x.fillStyle='white';x.fillRect(0,0,c.width,c.height);
  if(sheet)for(const p of layout.positions){const area={x:p.x,y:layout.height-p.y-p.height,width:p.width,height:p.height};drawDownloadPhoto(x,image,rect,area);if(watermarked)drawDownloadWatermark(x,area);x.strokeStyle='#dce1ec';x.lineWidth=.4;x.strokeRect(p.x,layout.height-p.y-p.height,p.width,p.height)}
  else{drawDownloadPhoto(x,image,rect,{width:c.width,height:c.height});if(watermarked)drawDownloadWatermark(x,{width:c.width,height:c.height})}
 },[image,crop,format,copies,adjust,watermarked]);
 const chooseFormat=id=>{setFormat(id);setAdjust(false);if(id==='pdf'&&!size.width)setCrop({...DEFAULT_PHOTO_CROP,sizeId:en?'35x45':'1.5-inch',freePosition:true})};
 const submit=async()=>{if(submitting.current||busy||!image)return;submitting.current=true;setBusy(true);setError('');try{const choice={...crop,format,copies:layout?.count};if(onAuthorize&&await onAuthorize(choice,{preview:preview.current?.toDataURL('image/jpeg',.84)})!==true){setError(text('Could not confirm download access. Please try again.','ยังยืนยันสิทธิ์ดาวน์โหลดไม่ได้ กรุณาลองใหม่'));return}const file=await withDeadline(()=>prepareEnglishDownload(blob,choice,pixelScale),{timeoutMs:30000,message:text('Preparing the file took too long. Please try again.','เตรียมไฟล์นานเกินไป กรุณาลองใหม่'),code:'DOWNLOAD_FILE_TIMEOUT'});await onDownload(file,choice)}catch(e){setError(en?(e.message||'Could not prepare your download.'):(e.message||'เตรียมไฟล์ไม่สำเร็จ กรุณาลองใหม่'))}finally{submitting.current=false;setBusy(false)}};
 const submitted=useRef(new Set()),submitRef=useRef(submit);submitRef.current=submit;
 useEffect(()=>{if(!autoSubmitKey||!image||submitted.current.has(autoSubmitKey))return;submitted.current.add(autoSubmitKey);void submitRef.current()},[autoSubmitKey,image]);
 const key=e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose()}if(e.key==='Tab'){const items=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];const first=items[0],last=items[items.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
 return <div className="en-download-overlay"><section className="en-download" ref={el=>{dialog.current=el;if(surfaceRef)surfaceRef.current=el}} role="dialog" aria-modal="true" aria-labelledby="en-download-title" tabIndex={-1} onKeyDown={key} aria-busy={busy}>
 <header><h1 id="en-download-title">{text('Download your photo','ดาวน์โหลดรูป')}</h1><button aria-label={text('Close download','ปิดหน้าดาวน์โหลด')} disabled={busy} onClick={onClose}>×</button></header>
 <div className="en-download-body"><div className="en-download-preview"><canvas ref={preview} data-watermarked={watermarked?'true':'false'} aria-label={layout&&!adjust?text('Letter print sheet preview','ตัวอย่างแผ่นพิมพ์ A4'):text('Photo preview','ตัวอย่างรูป')} onPointerDown={e=>{
  if((format!=='png'&&!adjust)||!image||busy||e.button!==0)return;
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:crop.zoom};drag.current=null;return}
  drag.current={x:e.clientX,y:e.clientY,crop:{...crop},width:e.currentTarget.getBoundingClientRect().width};
 }} onPointerMove={e=>{
  if(busy)return;if(pointers.current.has(e.pointerId))pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch.current&&pointers.current.size===2){const [a,b]=[...pointers.current.values()];const zoom=Math.max(.5,Math.min(3,pinch.current.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.current.distance)));setCrop(c=>({...c,zoom}));return}
  const d=drag.current;if(!d||!image)return;const target=size.width?size:{width:image.naturalWidth,height:image.naturalHeight};const r=downloadPhotoRect(image.naturalWidth,image.naturalHeight,target,d.crop);const next={...d.crop,x:d.crop.x-(e.clientX-d.x)*r.width/d.width/image.naturalWidth,y:d.crop.y-(e.clientY-d.y)*r.width/d.width/image.naturalHeight};setCrop({...next,freePosition:true,x:Math.max(-.5,Math.min(1.5,next.x)),y:Math.max(-.5,Math.min(1.5,next.y))});
 }} onPointerUp={e=>{pointers.current.delete(e.pointerId);drag.current=null;pinch.current=null}} onPointerCancel={e=>{pointers.current.delete(e.pointerId);drag.current=null;pinch.current=null}} onLostPointerCapture={e=>{pointers.current.delete(e.pointerId);drag.current=null;pinch.current=null}}/><small>{layout&&!adjust?text(`${layout.count} photos · Letter 8.5 × 11 in`,`${layout.count} รูป · A4 210 × 297 มม.`):size.width?text(`${size.width} × ${size.height} mm`,`${size.width} × ${size.height} มม.`):text('Original resolution','ขนาดเดิม')}</small></div>
 <div className={"en-download-settings"+(layout?" has-print-layout":"")}><fieldset disabled={busy}><legend className="en-download-visually-hidden">{text('File format','รูปแบบไฟล์')}</legend><div className="en-download-formats"><button aria-pressed={format==='png'} onClick={()=>chooseFormat('png')}>PNG</button><button aria-pressed={format==='pdf'} onClick={()=>chooseFormat('pdf')}>PDF</button></div></fieldset>
 <label className={layout?"en-download-size":"en-download-size en-download-full"}>{text('Photo size','ขนาดรูป')}<select aria-label={text('Photo size','ขนาดรูป')} disabled={busy} value={crop.sizeId} onChange={e=>setCrop({...DEFAULT_PHOTO_CROP,sizeId:e.target.value,freePosition:true})}>{sizes.filter(s=>format==='png'||s.width).map(s=><option key={s.id} value={s.id}>{s.id==='original'?text('Original resolution','ขนาดเดิม'):s.label}</option>)}</select></label>
 {photoPixels&&<div className="en-download-pixel-size" role="status" aria-live="polite"><span>{text('Photo dimensions','ขนาดภาพเป็นพิกเซล')}</span><strong>{photoPixels.width.toLocaleString()} × {photoPixels.height.toLocaleString()} px</strong>{format==='pdf'&&<small>{text('Per photo on the print sheet','ต่อรูปบนแผ่นพิมพ์')}</small>}</div>}
 {layout&&<><label className="en-download-copies">{text('Copies','จำนวนรูป')}<input disabled={busy} aria-label={text('Copies','จำนวนรูป')} type="number" min="1" max={layout.capacity} value={layout.count} onChange={e=>setCopies(Math.min(layout.capacity,Math.max(1,Number(e.target.value)||1)))}/></label><p>{text('Print at actual size (100%).','พิมพ์ที่ขนาดจริง / 100%')}</p></>}
 {format==='pdf'&&<button className="en-download-adjust" disabled={busy} aria-expanded={adjust} onClick={()=>setAdjust(!adjust)}>{adjust?text('Done adjusting','ปรับเสร็จแล้ว'):text('Adjust photo','ปรับรูป')}</button>}
 {(format==='png'||adjust)&&<div className="en-download-full en-download-crop-controls"><label>{text('Zoom','ซูม')}<input aria-label={text('Crop zoom','ซูมรูป')} type="range" min=".5" max="3" step=".01" value={crop.zoom} disabled={busy} onChange={e=>setCrop(c=>({...c,zoom:Number(e.target.value)}))}/></label><button disabled={busy} className="en-download-adjust" onClick={()=>setCrop(c=>({...DEFAULT_PHOTO_CROP,sizeId:c.sizeId,freePosition:true}))}>{text('Reset','รีเซ็ต')}</button></div>}

 {error&&<p role="alert">{error}</p>}</div></div><footer><button className="en-download-primary" disabled={busy||!image} onClick={submit}>{busy?text('Preparing…','กำลังเตรียมไฟล์…'):format==='pdf'?text('Download PDF','ดาวน์โหลด PDF'):text('Download photo','ดาวน์โหลดรูป')}</button></footer></section></div>;
}
