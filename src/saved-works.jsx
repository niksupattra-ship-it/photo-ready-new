import React,{useEffect,useRef,useState} from 'react';
import {deadlineFetch} from './deadline-fetch.js';
import {withDeadline} from './async-deadline.js';
import {SavedWorkPreview} from './saved-work-preview.jsx';
import {TRANSFER_HEADER,TRANSFER_VERSION,unpackSavedProjectTransfer} from './saved-work-transfer.js';
const savedWorkAccountScope=headers=>{const values=new Headers(headers);return JSON.stringify([values.get('Authorization')||'',values.get('X-Wallet-Id')||''])};
const savedWorkData=async response=>{try{return await response.json()}catch(error){if(response.ok||error.name==='TimeoutError'||error.name==='AbortError')throw error;return null}};
const savedWorkTimestamp=value=>typeof value==='string'&&value?Date.parse(value):NaN;
const savedWorkDate=value=>{const time=savedWorkTimestamp(value);return Number.isFinite(time)?new Date(time).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}):null};
function WorkExpiry({expiresAt,serverNow}){
 const expires=savedWorkTimestamp(expiresAt),date=savedWorkDate(expiresAt);
 if(!date)return <p className="idprom-saved-expiry"><span>วันหมดอายุ</span>ยังไม่พร้อม กรุณาโหลดรายการอีกครั้ง</p>;
 const remaining=expires-savedWorkTimestamp(serverNow),known=Number.isFinite(remaining);
 const state=!known?'':remaining<=0?' expired':remaining<86400000?' urgent':remaining<=604800000?' soon':'';
 return <p className={'idprom-saved-expiry'+state}><span>วันหมดอายุ</span><time dateTime={expiresAt}>{date} น.</time></p>;
}
const Icon=({kind})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='trash'?<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>:kind==='close'?<path d="m6 6 12 12M18 6 6 18"/>:kind==='open'?<><path d="M9 5h10v14H9M3 12h11m-4-4 4 4-4 4"/></>:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 3-4 3 6"/></>}</svg>;
export function SavedWorks({headers,onOpen,onClose,onDelete}){
 const [items,setItems]=useState([]),[message,setMessage]=useState('กำลังโหลดงาน…'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[limit,setLimit]=useState(3),[deleteId,setDeleteId]=useState(null),[revision,setRevision]=useState(0),[canReload,setCanReload]=useState(false),[retention,setRetention]=useState(null);
 const panel=useRef(null),lifetime=useRef({active:true}),listRequest=useRef(null),action=useRef(null),callbacks=useRef({headers,onOpen,onClose,onDelete});callbacks.current={headers,onOpen,onClose,onDelete};
 const scopeNow=()=>{try{return savedWorkAccountScope(callbacks.current.headers())}catch{return null}};
 const accountScope=scopeNow();
 const current=task=>lifetime.current.active&&action.current===task&&!task.controller.signal.aborted&&task.accountScope===scopeNow();
 const close=()=>{if(!lifetime.current.active)return;lifetime.current.active=false;listRequest.current?.abort();action.current?.controller.abort();callbacks.current.onClose()};
 useEffect(()=>{const life={active:true};lifetime.current=life;const previous=document.activeElement;panel.current?.querySelector('button')?.focus();const escape=event=>{if(event.key==='Escape'&&life.active){event.preventDefault();event.stopPropagation();close()}};document.addEventListener('keydown',escape,true);return()=>{life.active=false;listRequest.current?.abort();action.current?.controller.abort();document.removeEventListener('keydown',escape,true);previous?.focus?.()}},[]);
 useEffect(()=>{
  const controller=new AbortController();listRequest.current=controller;const active=()=>lifetime.current.active&&listRequest.current===controller&&!controller.signal.aborted&&scopeNow()===accountScope;
  action.current?.controller.abort();action.current=null;setBusy(false);setItems([]);setDeleteId(null);setRetention(null);
  setLoading(true);setCanReload(false);setMessage('กำลังโหลดงาน…');
  (async()=>{try{
   const r=await deadlineFetch('/api/saved-work',{headers:callbacks.current.headers(),cache:'no-store',signal:controller.signal});const d=await savedWorkData(r);
   if(!r.ok)throw Error(d?.message||'โหลดงานไม่สำเร็จ');if(!Array.isArray(d?.items))throw Error('ข้อมูลรายการงานไม่ครบ กรุณาโหลดรายการอีกครั้ง');
   if(active()){setItems(d.items);setLimit(Number(d.limit)>0?Number(d.limit):3);setRetention(d.retention&&d.retention.days===45?d.retention:null);setMessage('')}
  }catch(error){if(active()){setMessage(error.message||'โหลดงานไม่สำเร็จ');setCanReload(true)}}finally{if(active())setLoading(false)}})();
  return()=>{controller.abort();if(listRequest.current===controller)listRequest.current=null};
 },[revision,accountScope]);
 const begin=()=>{if(!lifetime.current.active||action.current||loading)return null;let requestHeaders;try{requestHeaders=callbacks.current.headers()}catch(error){setMessage(error.message||'ตรวจบัญชีไม่สำเร็จ');return null}const task={controller:new AbortController(),headers:requestHeaders,accountScope:savedWorkAccountScope(requestHeaders)};action.current=task;setBusy(true);setCanReload(false);return task};
 const finish=task=>{if(action.current===task){action.current=null;if(lifetime.current.active)setBusy(false)}};
 const open=async id=>{const task=begin();if(!task)return;setMessage('กำลังเปิดงานเต็มความละเอียด…');try{
  const requestHeaders=new Headers(task.headers);requestHeaders.set(TRANSFER_HEADER,TRANSFER_VERSION);
  const r=await deadlineFetch('/api/saved-work/'+encodeURIComponent(id),{headers:requestHeaders,cache:'no-store',signal:task.controller.signal});const d=await savedWorkData(r);
  if(!current(task))return;
  if(r.status===410&&d?.error==='saved_work_expired'){setItems(previous=>previous.filter(item=>item.id!==id));setDeleteId(null);setMessage(d.message||'งานนี้หมดอายุการจัดเก็บแล้ว กรุณาดาวน์โหลดงานอื่นก่อนหมดอายุ');setCanReload(true);return}
  if(!r.ok)throw Error(d?.message||'เปิดงานไม่สำเร็จ');
  if(d?.project?.format==='idprom-project-transfer')d.project=unpackSavedProjectTransfer(d.project);
  await withDeadline(()=>callbacks.current.onOpen(d,{signal:task.controller.signal,accountScope:task.accountScope}),{timeoutMs:60000,message:'เปิดงานใช้เวลานาน กรุณาลองอีกครั้ง งานเดิมยังอยู่',code:'SAVED_WORK_OPEN_TIMEOUT',onTimeout:()=>task.controller.abort()});
  if(current(task))close();
 }catch(error){if(lifetime.current.active&&action.current===task&&task.accountScope===scopeNow()){setMessage(error.message||'เปิดงานไม่สำเร็จ');setCanReload(true)}}finally{finish(task)}};
 const remove=async id=>{const task=begin();if(!task)return;setMessage('กำลังลบงาน…');try{
  const r=await deadlineFetch('/api/saved-work/'+encodeURIComponent(id),{method:'DELETE',headers:task.headers,signal:task.controller.signal});const d=await savedWorkData(r);
  if(!current(task))return;
  if(r.status===410&&d?.error==='saved_work_expired'){setItems(previous=>previous.filter(item=>item.id!==id));setDeleteId(null);setMessage(d.message||'งานนี้หมดอายุการจัดเก็บแล้ว');setCanReload(true);return}
  if(!r.ok)throw Error(d?.message||'ลบงานไม่สำเร็จ');
  setItems(previous=>previous.filter(item=>item.id!==id));setDeleteId(null);callbacks.current.onDelete?.(id);setMessage('ลบงานแล้ว · บันทึกงานใหม่ได้เมื่อมีช่องว่าง');
 }catch(error){if(lifetime.current.active&&action.current===task&&task.accountScope===scopeNow()){setDeleteId(null);setMessage(error.name==='TimeoutError'?'ยังยืนยันผลการลบไม่ได้ กรุณาโหลดรายการอีกครั้งเพื่อตรวจสอบ':error.message||'ลบงานไม่สำเร็จ');setCanReload(true)}}finally{finish(task)}};
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}if(e.key==='Tab'){const buttons=[...panel.current.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 return <div className="idprom-saved-overlay" onKeyDown={keys} onClick={e=>{if(e.target===e.currentTarget)close()}}>
 <style>{`
 .idprom-saved-overlay{position:fixed;inset:0;z-index:2147483646;background:#030c12c9;backdrop-filter:blur(5px);display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:20px;font-family:inherit;box-sizing:border-box;overflow:hidden}
 .idprom-saved-dialog,.idprom-saved-dialog *{box-sizing:border-box}.idprom-saved-dialog{width:min(860px,100%);min-width:0;max-height:88dvh;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;background:#152630;color:#e9f4f6;border:1px solid #35515c;border-radius:20px;padding:24px;box-shadow:0 24px 80px #0008}
 .idprom-saved-dialog button{font:inherit;cursor:pointer;transition:background .15s,border-color .15s}.idprom-saved-dialog button:disabled{opacity:.5;cursor:wait}.idprom-saved-dialog button:focus-visible{outline:2px solid #51dfd2;outline-offset:3px}.idprom-saved-dialog svg{width:20px;height:20px;flex-shrink:0}
 .idprom-saved-heading{display:flex;align-items:flex-start;gap:14px}.idprom-saved-heading>div{min-width:0;flex:1;overflow-wrap:anywhere}.idprom-saved-heading h2{font-size:23px;line-height:1.35;margin:0 0 5px}.idprom-saved-heading p{font-size:13px;color:#abc1c9;margin:0;line-height:1.6}.idprom-saved-brand{width:44px;height:44px;border-radius:12px;background:#1d4b4c;color:#53dfd4;display:grid;place-items:center;flex-shrink:0}.idprom-saved-brand svg{width:25px;height:25px}.idprom-saved-close{margin-left:auto;display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border:1px solid #3a515d;background:#20333e;color:#d8e8ed;border-radius:9px}
 .idprom-saved-capacity{margin:22px 0 18px}.idprom-saved-capacity-label{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:#abc1c9;margin-bottom:9px}.idprom-saved-capacity-label strong{font-size:14px;color:#54dfd2}.idprom-saved-meter{height:5px;background:#293e49;border-radius:8px;overflow:hidden}.idprom-saved-meter span{display:block;height:100%;background:#54dcd0;border-radius:8px}
 .idprom-saved-full{padding:12px 14px;margin:0 0 16px;border:1px solid #7b6040;background:#3d3328;color:#f9d9a4;border-radius:11px;font-size:13px;line-height:1.65}.idprom-saved-full strong{display:block}
 .idprom-saved-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.idprom-saved-row{display:flex;flex-direction:column;align-items:stretch;gap:18px;min-width:0;padding:18px;background:#1d313d;border:1px solid #35505d;border-radius:15px}.idprom-saved-card-heading{display:flex;align-items:flex-start;gap:12px;min-width:0}.idprom-saved-card-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:12px}.idprom-saved-card-heading .idprom-saved-preview{width:84px;height:112px;flex:0 0 84px}.idprom-saved-card-heading strong{min-width:0;overflow-wrap:anywhere;font-size:14px;color:#f0f7f8;line-height:1.5}.idprom-saved-index{width:38px;height:40px;display:grid;place-items:center;background:#29464f;border:1px solid #3b5c64;border-radius:10px;color:#78e2d7;flex-shrink:0}
 .idprom-saved-expiry{margin:0;font-size:13px;color:#dcebef;line-height:1.8;overflow-wrap:anywhere}.idprom-saved-expiry>span{display:block;color:#a5bdc6;font-size:12px;margin-bottom:3px}.idprom-saved-expiry time{display:block;font-weight:600}.idprom-saved-expiry.soon time{color:#f2d89e}.idprom-saved-expiry.urgent time,.idprom-saved-expiry.expired time{color:#ffb6b5}
 .idprom-saved-actions{display:flex;gap:8px;margin-top:auto}.idprom-saved-open,.idprom-saved-delete,.idprom-saved-cancel{display:flex;gap:6px;align-items:center;justify-content:center;min-height:42px;border-radius:9px;padding:10px 12px;font-size:12px;border:1px solid #42606b;background:#223b46;color:#e1f1f4}.idprom-saved-open{flex:1;border-color:#51d8cf;background:#4edbcf;color:#102e35;font-weight:600}.idprom-saved-delete{border-color:#795054;background:#392f37;color:#f4afb4}.idprom-saved-actions svg{width:17px;height:17px}
 .idprom-saved-confirm{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #3c515c;padding-top:14px;font-size:12px;line-height:1.65;color:#f0b5b8}.idprom-saved-confirm span{flex-basis:100%;overflow-wrap:anywhere}.idprom-saved-confirm button{flex:1;min-width:0}
 .idprom-saved-empty{padding:30px 12px;text-align:center;color:#abc1c9;font-size:14px;line-height:1.8;border:1px dashed #3c5662;border-radius:12px}.idprom-saved-status{font-size:13px;color:#bcece5;line-height:1.65;margin:14px 0 0}.idprom-saved-footer{margin-top:20px;padding-top:15px;border-top:1px solid #304752;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.idprom-saved-footer small{font-size:12px;color:#a5bbc6;line-height:1.5}
 @media(max-width:900px){.idprom-saved-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:540px){.idprom-saved-overlay{padding:12px}.idprom-saved-dialog{width:100%;max-height:calc(100dvh - 24px);padding:18px;border-radius:16px}.idprom-saved-heading{gap:10px}.idprom-saved-brand{width:36px;height:36px}.idprom-saved-heading h2{font-size:20px}.idprom-saved-list{grid-template-columns:minmax(0,1fr);gap:12px}.idprom-saved-row{padding:16px;gap:14px}.idprom-saved-expiry time{font-size:14px}.idprom-saved-card-heading .idprom-saved-preview{width:96px;height:128px;flex-basis:96px}}
 `}</style>
 <section ref={panel} className="idprom-saved-dialog" role="dialog" aria-modal="true" aria-labelledby="idprom-saved-title" aria-describedby="idprom-saved-description" aria-busy={busy||loading}>
 <header className="idprom-saved-heading"><span className="idprom-saved-brand"><Icon/></span><div><h2 id="idprom-saved-title">งานที่บันทึกไว้</h2><p id="idprom-saved-description">เปิดงานเดิมด้วยบัญชีอีเมลเดียวกัน</p></div><button className="idprom-saved-close" aria-label="ปิดรายการงาน" onClick={close}><Icon kind="close"/></button></header>
 <div className="idprom-saved-capacity"><div className="idprom-saved-capacity-label"><span>พื้นที่เก็บงานของคุณ</span><strong>{loading?'…':items.length} / {limit} งาน</strong></div><div className="idprom-saved-meter" aria-hidden="true"><span style={{width:Math.min(100,items.length/limit*100)+'%'}}/></div></div>
 {!loading&&items.length>=limit&&<p className="idprom-saved-full" role="alert"><strong>พื้นที่เก็บงานเต็มแล้ว</strong>ลบงานเก่าก่อนบันทึกงานใหม่ · ยังบันทึกทับงานเดิมได้</p>}
 <div className="idprom-saved-list">{items.map((item,index)=><article key={item.id} className="idprom-saved-row" aria-label={'งานที่ '+(index+1)}><div className="idprom-saved-card-heading"><SavedWorkPreview key={JSON.stringify([accountScope,item.id,item.updated_at])} id={item.id} updatedAt={item.updated_at} headers={()=>callbacks.current.headers()} accountScope={accountScope}/><div className="idprom-saved-card-copy"><strong>{item.name&&item.name!=='รูป IDพร้อม'?item.name:'งานที่ '+(index+1)}</strong><WorkExpiry expiresAt={item.expires_at} serverNow={retention?.serverNow}/></div></div><div className="idprom-saved-actions"><button className="idprom-saved-open" disabled={busy||loading||deleteId===item.id} onClick={()=>open(item.id)} aria-label={'เปิดงาน '+(index+1)}><Icon kind="open"/>เปิดงาน</button><button className="idprom-saved-delete" disabled={busy||loading} aria-label={'ลบงาน '+(index+1)} onClick={()=>setDeleteId(deleteId===item.id?null:item.id)}><Icon kind="trash"/>ลบ</button></div>{deleteId===item.id&&<div className="idprom-saved-confirm"><span>ลบงานนี้? เมื่อลบแล้วจะกู้คืนไม่ได้</span><button className="idprom-saved-cancel" disabled={busy} onClick={()=>setDeleteId(null)}>ยกเลิก</button><button className="idprom-saved-delete" disabled={busy} onClick={()=>remove(item.id)}>ยืนยันลบ</button></div>}</article>)}</div>
 {!loading&&!items.length&&!message&&<div className="idprom-saved-empty">ยังไม่มีงานที่บันทึกไว้<br/>กด “บันทึก” ใน Studio เพื่อเก็บงาน</div>}
 {message&&<p className="idprom-saved-status" role="status">{message}</p>}
 {canReload&&<button className="idprom-saved-cancel" disabled={busy||loading} onClick={()=>{setDeleteId(null);setRevision(value=>value+1)}}>โหลดรายการอีกครั้ง</button>}
 <footer className="idprom-saved-footer"><small>วันหมดอายุแสดงตามเวลาไทย</small><button className="idprom-saved-cancel" onClick={close}>กลับไป Studio</button></footer>
 </section></div>;
}
