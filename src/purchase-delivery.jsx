import {EnglishDownload} from './english-download.jsx';
import {deliverImage} from './image-download.js';
import {interfaceLocale,localizedLink} from './english-preview.js';
import React,{useEffect,useRef,useState} from 'react';
import {AccountFlowDialog} from './account-flow-dialog.jsx';
import {PhotoSizeEditor,DEFAULT_PHOTO_CROP} from './photo-size.jsx';
import './purchase-delivery.css';
export function PurchaseSummary({preview,price}){return <div className="purchase-summary">{preview&&<img src={preview} alt="รูปที่เลือกซื้อ"/>}<div><strong>{price==='159'?'รับรูปนี้ + ทรงผม':'รับรูปนี้'}{price&&<> · {price} บาท</>}</strong><small>สำหรับรูปที่แสดงนี้</small></div></div>}
const cropKey=crop=>JSON.stringify([crop?.sizeId||'original',crop?.x??.5,crop?.y??.5,crop?.zoom??1,crop?.freePosition===true]);
function DeliveryIcon({kind}){return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='download'?<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>:kind==='open'?<><path d="M14 3h7v7M21 3l-11 11"/><path d="M10 3H3v18h18v-7"/></>:<><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/></>}</svg>}
function LegacyPurchaseReceipt({receipt,onClose,onRetry,onPrepareSize,onHistory,onAutomaticDownload}){
 const [file,setFile]=useState(null),[message,setMessage]=useState(''),[selectedCrop,setSelectedCrop]=useState(()=>receipt.crop||{...DEFAULT_PHOTO_CROP});
 const surface=useRef(null),latest=useRef({receipt,onPrepareSize,onAutomaticDownload});latest.current={receipt,onPrepareSize,onAutomaticDownload};
 const selectedKey=cropKey(selectedCrop),preparedKey=cropKey(receipt.crop),targetKey=cropKey(receipt.targetCrop);
 useEffect(()=>{const url=URL.createObjectURL(receipt.blob);setFile({url,blob:receipt.blob});return()=>URL.revokeObjectURL(url)},[receipt.blob]);
 useEffect(()=>{
  const current=latest.current.receipt;
  if(selectedKey===cropKey(current.crop)&&!current.preparing&&!current.prepareError)return;
  if(cropKey(current.targetCrop)===selectedKey&&(current.preparing||current.prepareError))return;
  const timer=setTimeout(()=>{void latest.current.onPrepareSize({...selectedCrop})},250);return()=>clearTimeout(timer);
 },[selectedKey,preparedKey,targetKey,receipt.preparing,receipt.prepareError]);
 useEffect(()=>setMessage(''),[selectedKey]);
 useEffect(()=>{
  if(!receipt.autoDownloadKey)return;
  const result=latest.current.onAutomaticDownload?.(latest.current.receipt,surface.current);
  if(result==='requested')setMessage('ส่งคำขอดาวน์โหลดไฟล์ความละเอียดเต็มแล้ว');
  else if(result==='failed')setMessage('ยังเริ่มดาวน์โหลดอัตโนมัติไม่ได้ กรุณากดดาวน์โหลดรูป');
 },[receipt.receiptKey,receipt.autoDownloadKey]);
 const copy=async()=>{try{await navigator.clipboard.writeText(new URL(localizedLink(receipt.archive.receiveUrl),location.origin).href);setMessage('คัดลอกลิงก์รูปตามขนาดที่เลือกแล้ว')}catch{setMessage('คัดลอกไม่ได้ กรุณาเปิดหน้ารับรูปแล้วคัดลอกที่อยู่จากเบราว์เซอร์')}};
 const event=(type,crop)=>{try{receipt.audit?.delivery?.(type,{method:'save_link',sizeId:crop.sizeId})}catch{}};
 const actions=({crop,ready:previewReady})=>{
  const waiting=receipt.preparing||cropKey(crop)!==preparedKey,ready=previewReady&&!waiting&&file?.blob===receipt.blob;
  return <><a className="purchase-primary" href={file?.url} download={receipt.name||'IDPROM-photo.png'} aria-disabled={!ready} onClick={e=>{if(!ready){e.preventDefault();return}event('download_requested',crop);setMessage('ส่งคำขอดาวน์โหลดแล้ว กรุณาตรวจไฟล์ในเครื่อง')}}><DeliveryIcon kind="download"/>ดาวน์โหลดรูป</a><a className="purchase-secondary" href={file?.url} target="_blank" rel="noopener" aria-disabled={!ready} onClick={e=>{if(!ready){e.preventDefault();return}event('save_clicked',crop)}}><DeliveryIcon kind="open"/>เปิดรูปเพื่อบันทึก</a><button className="purchase-secondary" disabled={!ready||!receipt.archive} onClick={copy}><DeliveryIcon kind="copy"/>คัดลอกลิงก์รับรูป</button>
   {waiting&&!receipt.prepareError&&<p role="status">กำลังเตรียมไฟล์ตามขนาดที่เลือก…</p>}
   {receipt.prepareError&&<div className="purchase-error" role="status">{receipt.prepareError}<button onClick={()=>onPrepareSize(crop)}>ลองเตรียมรูปอีกครั้ง</button></div>}
   {ready&&receipt.archive&&<a className="purchase-receive-link" href={localizedLink(receipt.archive.receiveUrl)} target="_blank" rel="noopener">เปิดหน้ารับรูปที่เก็บไว้</a>}
   {ready&&receipt.archiving&&<p role="status">กำลังเก็บลิงก์รูปตามขนาดที่เลือก…</p>}
   {ready&&receipt.error&&<div className="purchase-error" role="status">{receipt.error}<button onClick={onRetry}>ลองเก็บลิงก์อีกครั้ง</button></div>}
   {message&&<p role="status">{message}</p>}
   <p className="purchase-hint">โหลดไม่ได้? เปิดลิงก์รับรูปใน Chrome หรือ Safari</p>
  </>;
 };
 return <AccountFlowDialog label="รับรูป" onClose={onClose}><div className="purchase-surface"><section ref={surface} className="purchase-page purchase-receipt purchase-receipt-size"><header className="purchase-receipt-header"><strong>IDพร้อม <em>Studio</em></strong><h1><span aria-hidden="true">✓</span> {receipt.paid?'ชำระเงินสำเร็จ':'รูปพร้อมดาวน์โหลด'}</h1><button onClick={onClose} aria-label="ปิดหน้ารับรูป">×</button></header><PhotoSizeEditor embedded blob={receipt.sourceBlob||receipt.blob} value={receipt.crop||DEFAULT_PHOTO_CROP} sizes={receipt.sizes} pixelScale={receipt.pixelScale||2} onChange={setSelectedCrop} actions={actions}/><footer className="purchase-receipt-footer"><button className="purchase-link" onClick={onHistory}>ดูรูปที่ซื้อแล้ว · เก็บไฟล์รับรูป 7 วัน</button><button className="purchase-link" onClick={onClose}>กลับไปแต่งรูป</button></footer></section></div></AccountFlowDialog>;
}
export function PurchaseReceipt(props){return <EnglishPurchaseReceipt {...props}/>}
function EnglishPurchaseReceipt({receipt,onClose,onPrepareSize,onAutomaticDownload}){
 const surface=useRef(null);
 useEffect(()=>{if(receipt.autoDownloadKey)onAutomaticDownload?.(receipt,surface.current)},[receipt.receiptKey,receipt.autoDownloadKey]);
 return <EnglishDownload blob={receipt.sourceBlob||receipt.blob} value={receipt.crop||DEFAULT_PHOTO_CROP} pixelScale={receipt.pixelScale||2} surfaceRef={surface} onClose={onClose} onDownload={async(file,choice)=>{
  if(!surface.current?.isConnected)throw Error('Reopen Download to save this photo.');
  const extension=file.type==='application/pdf'?'pdf':file.type==='image/jpeg'?'jpg':'png';
  const name='IDPROM-'+choice.sizeId+(extension==='pdf'?(interfaceLocale()==='th-TH'?'-A4':'-Letter'):'')+'.'+extension;
  try{receipt.audit?.emit('file_prepared',{sizeId:choice.sizeId,fileType:file.type,byteSize:file.size})}catch{}
  deliverImage(file,name,{onEvent:receipt.audit?.delivery});
  const crop={sizeId:choice.sizeId,x:choice.x,y:choice.y,zoom:choice.zoom,freePosition:choice.freePosition===true};
  if(cropKey(crop)!==cropKey(receipt.crop))void onPrepareSize?.(crop);
 }}/>;
}
export function PurchasedPhotos({request,headers,onClose,onOpen}){
 const active=useRef(false),opening=useRef(null);
 const [items,setItems]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[urls,setUrls]=useState({}),[serverOffset,setServerOffset]=useState(0);
 useEffect(()=>{const controller=new AbortController(),owned=[];active.current=true;
  (async()=>{try{const r=await request('/api/purchased-photos',{headers:headers(),cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(data.message||'ยังเปิดรูปที่ซื้อไม่ได้');if(!active.current)return;if(!Array.isArray(data.items))throw Error('โหลดรายการไม่สำเร็จ กรุณาลองใหม่');setItems(data.items);setServerOffset(Number.isFinite(Date.parse(data.serverNow))?Date.parse(data.serverNow)-Date.now():0);
   for(const item of data.items){const response=await request(item.previewUrl,{headers:headers(),cache:'no-store',signal:controller.signal});if(!response.ok)continue;const blob=await response.blob();if(!active.current)break;const url=URL.createObjectURL(blob);owned.push(url);setUrls(previous=>({...previous,[item.id]:url}))}
  }catch(e){if(active.current)setError(e.message||'โหลดรายการไม่สำเร็จ กรุณาลองใหม่')}})();return()=>{active.current=false;controller.abort();opening.current?.abort();owned.forEach(url=>URL.revokeObjectURL(url))};
 },[]);
 const open=async item=>{if(opening.current)return;const controller=new AbortController();opening.current=controller;setBusy(item.id);setError('');try{const r=await request(item.imageUrl,{headers:headers(),cache:'no-store',signal:controller.signal});if(!r.ok)throw Error(r.status===410?'รูปนี้หมดระยะเก็บ 7 วันแล้ว':'ยังเปิดรูปไม่ได้ กรุณาลองใหม่ ไม่ต้องชำระซ้ำ');const blob=await r.blob();if(active.current&&!controller.signal.aborted)await onOpen(blob,item)}catch(e){if(active.current&&!controller.signal.aborted)setError(e.message)}finally{if(opening.current===controller)opening.current=null;if(active.current)setBusy('')}};
 return <AccountFlowDialog label="รูปที่ซื้อแล้ว" onClose={onClose}><div className="purchase-surface"><section className="purchase-page"><header><strong>IDพร้อม <em>Studio</em></strong><button onClick={onClose} aria-label="ปิดรูปที่ซื้อแล้ว">×</button></header><div className="purchase-step">6 · กลับมารับรูปภายหลัง</div><h1>รูปที่ซื้อแล้ว</h1>{error&&<p className="purchase-error" role="status">{error}</p>}{!items&&!error&&<p role="status">กำลังโหลดรูปที่ซื้อแล้ว…</p>}{items?.length===0&&<p>ยังไม่มีไฟล์รับรูปที่เก็บไว้ในช่วง 7 วันนี้</p>}{items?.map((item,i)=><article className="purchased-photo-row" key={item.id}>{urls[item.id]?<img src={urls[item.id]} alt={'รูปที่ซื้อ '+(i+1)}/>:<div className="purchased-photo-placeholder"/>}<div><strong>รูป {item.id.slice(-6).toUpperCase()}</strong><small>{(new Date(item.purchasedAt).toLocaleString(interfaceLocale(),{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'})+(interfaceLocale()==='en-GB'?' (UTC+07:00)':''))}</small><span>เหลือเวลาเก็บอีก {Math.max(0,Math.ceil((Date.parse(item.expiresAt)-Date.now()-serverOffset)/86400000))} วัน</span></div><button className="purchase-primary" disabled={!!busy} onClick={()=>open(item)}>{busy===item.id?'กำลังเปิด…':'รับรูป'}</button></article>)}<p className="purchase-hint">ดาวน์โหลดซ้ำได้ภายใน 7 วันนับจากรับสิทธิ์ของงาน<br/>เมื่อครบกำหนด ระบบลบไฟล์รับรูปที่เก็บไว้</p></section></div></AccountFlowDialog>;
}
