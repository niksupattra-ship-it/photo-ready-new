import React,{useEffect,useRef,useState} from 'react';
import {deadlineFetch} from './deadline-fetch.js';
import {withDeadline} from './async-deadline.js';
const savedWorkAccountScope=headers=>{const values=new Headers(headers);return JSON.stringify([values.get('Authorization')||'',values.get('X-Wallet-Id')||''])};
const savedWorkData=async response=>{try{return await response.json()}catch(error){if(response.ok||error.name==='TimeoutError'||error.name==='AbortError')throw error;return null}};
const Icon=({kind})=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='trash'?<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>:kind==='close'?<path d="m6 6 12 12M18 6 6 18"/>:kind==='open'?<><path d="M9 5h10v14H9M3 12h11m-4-4 4 4-4 4"/></>:<><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 3-4 3 6"/></>}</svg>;
export function SavedWorks({headers,onOpen,onClose,onDelete}){
 const [items,setItems]=useState([]),[message,setMessage]=useState('กำลังโหลดงาน…'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[limit,setLimit]=useState(3),[deleteId,setDeleteId]=useState(null),[revision,setRevision]=useState(0),[canReload,setCanReload]=useState(false);
 const panel=useRef(null),lifetime=useRef({active:true}),listRequest=useRef(null),action=useRef(null),callbacks=useRef({headers,onOpen,onClose,onDelete});callbacks.current={headers,onOpen,onClose,onDelete};
 const scopeNow=()=>{try{return savedWorkAccountScope(callbacks.current.headers())}catch{return null}};
 const accountScope=scopeNow();
 const current=task=>lifetime.current.active&&action.current===task&&!task.controller.signal.aborted&&task.accountScope===scopeNow();
 const close=()=>{if(!lifetime.current.active)return;lifetime.current.active=false;listRequest.current?.abort();action.current?.controller.abort();callbacks.current.onClose()};
 useEffect(()=>{const life={active:true};lifetime.current=life;const previous=document.activeElement;panel.current?.querySelector('button')?.focus();const escape=event=>{if(event.key==='Escape'&&life.active){event.preventDefault();event.stopPropagation();close()}};document.addEventListener('keydown',escape,true);return()=>{life.active=false;listRequest.current?.abort();action.current?.controller.abort();document.removeEventListener('keydown',escape,true);previous?.focus?.()}},[]);
 useEffect(()=>{
  const controller=new AbortController();listRequest.current=controller;const active=()=>lifetime.current.active&&listRequest.current===controller&&!controller.signal.aborted&&scopeNow()===accountScope;
  action.current?.controller.abort();action.current=null;setBusy(false);setItems([]);setDeleteId(null);
  setLoading(true);setCanReload(false);setMessage('กำลังโหลดงาน…');
  (async()=>{try{
   const r=await deadlineFetch('/api/saved-work',{headers:callbacks.current.headers(),cache:'no-store',signal:controller.signal});const d=await savedWorkData(r);
   if(!r.ok)throw Error(d?.message||'โหลดงานไม่สำเร็จ');if(!Array.isArray(d?.items))throw Error('ข้อมูลรายการงานไม่ครบ กรุณาโหลดรายการอีกครั้ง');
   if(active()){setItems(d.items);setLimit(Number(d.limit)>0?Number(d.limit):3);setMessage('')}
  }catch(error){if(active()){setMessage(error.message||'โหลดงานไม่สำเร็จ');setCanReload(true)}}finally{if(active())setLoading(false)}})();
  return()=>{controller.abort();if(listRequest.current===controller)listRequest.current=null};
 },[revision,accountScope]);
 const begin=()=>{if(!lifetime.current.active||action.current||loading)return null;let requestHeaders;try{requestHeaders=callbacks.current.headers()}catch(error){setMessage(error.message||'ตรวจบัญชีไม่สำเร็จ');return null}const task={controller:new AbortController(),headers:requestHeaders,accountScope:savedWorkAccountScope(requestHeaders)};action.current=task;setBusy(true);setCanReload(false);return task};
 const finish=task=>{if(action.current===task){action.current=null;if(lifetime.current.active)setBusy(false)}};
 const open=async id=>{const task=begin();if(!task)return;setMessage('กำลังเปิดงานเต็มความละเอียด…');try{
  const r=await deadlineFetch('/api/saved-work/'+encodeURIComponent(id),{headers:task.headers,cache:'no-store',signal:task.controller.signal});const d=await savedWorkData(r);
  if(!r.ok)throw Error(d?.message||'เปิดงานไม่สำเร็จ');if(!current(task))return;
  await withDeadline(()=>callbacks.current.onOpen(d,{signal:task.controller.signal,accountScope:task.accountScope}),{timeoutMs:60000,message:'เปิดงานใช้เวลานาน กรุณาลองอีกครั้ง งานเดิมยังอยู่',code:'SAVED_WORK_OPEN_TIMEOUT',onTimeout:()=>task.controller.abort()});
  if(current(task))close();
 }catch(error){if(lifetime.current.active&&action.current===task){setMessage(error.message||'เปิดงานไม่สำเร็จ');setCanReload(true)}}finally{finish(task)}};
 const remove=async id=>{const task=begin();if(!task)return;setMessage('กำลังลบงาน…');try{
  const r=await deadlineFetch('/api/saved-work/'+encodeURIComponent(id),{method:'DELETE',headers:task.headers,signal:task.controller.signal});const d=await savedWorkData(r);
  if(!r.ok)throw Error(d?.message||'ลบงานไม่สำเร็จ');if(!current(task))return;
  setItems(previous=>previous.filter(item=>item.id!==id));setDeleteId(null);callbacks.current.onDelete?.(id);setMessage('ลบงานแล้ว · บันทึกงานใหม่ได้เมื่อมีช่องว่าง');
 }catch(error){if(lifetime.current.active&&action.current===task){setDeleteId(null);setMessage(error.name==='TimeoutError'?'ยังยืนยันผลการลบไม่ได้ กรุณาโหลดรายการอีกครั้งเพื่อตรวจสอบ':error.message||'ลบงานไม่สำเร็จ');setCanReload(true)}}finally{finish(task)}};
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}if(e.key==='Tab'){const buttons=[...panel.current.querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 return <div className="idprom-saved-overlay" onKeyDown={keys} onClick={e=>{if(e.target===e.currentTarget)close()}}>
 <style>{`
 .idprom-saved-overlay{position:fixed;inset:0;z-index:2147483646;background:#030c12c9;backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px;font-family:inherit}
 .idprom-saved-dialog,.idprom-saved-dialog *{box-sizing:border-box}.idprom-saved-dialog{width:580px;max-width:100%;max-height:88dvh;overflow:auto;background:#152630;color:#e9f4f6;border:1px solid #35515c;border-radius:20px;padding:24px;box-shadow:0 24px 80px #0008}
 .idprom-saved-dialog button{font:inherit;cursor:pointer;transition:background .15s,border-color .15s}.idprom-saved-dialog button:disabled{opacity:.5;cursor:wait}.idprom-saved-dialog button:focus-visible{outline:2px solid #51dfd2;outline-offset:3px}.idprom-saved-dialog svg{width:20px;height:20px;flex-shrink:0}
 .idprom-saved-heading{display:flex;align-items:flex-start;gap:14px}.idprom-saved-heading h2{font-size:23px;line-height:1.35;margin:0 0 5px}.idprom-saved-heading p{font-size:13px;color:#abc1c9;margin:0;line-height:1.6}.idprom-saved-brand{width:44px;height:44px;border-radius:12px;background:#1d4b4c;color:#53dfd4;display:grid;place-items:center;flex-shrink:0}.idprom-saved-brand svg{width:25px;height:25px}.idprom-saved-close{margin-left:auto;display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border:1px solid #3a515d;background:#20333e;color:#d8e8ed;border-radius:9px}
 .idprom-saved-capacity{margin:22px 0 18px}.idprom-saved-capacity-label{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;color:#abc1c9;margin-bottom:9px}.idprom-saved-capacity-label strong{font-size:14px;color:#54dfd2}.idprom-saved-meter{height:5px;background:#293e49;border-radius:8px;overflow:hidden}.idprom-saved-meter span{display:block;height:100%;background:#54dcd0;border-radius:8px}
 .idprom-saved-full{padding:12px 14px;margin:0 0 16px;border:1px solid #7b6040;background:#3d3328;color:#f9d9a4;border-radius:11px;font-size:13px;line-height:1.65}.idprom-saved-full strong{display:block}
 .idprom-saved-list{display:grid;gap:10px}.idprom-saved-row{display:flex;gap:12px;align-items:center;padding:14px;background:#1d313d;border:1px solid #35505d;border-radius:13px;flex-wrap:wrap}.idprom-saved-index{width:38px;height:43px;display:grid;place-items:center;background:#29424d;border-radius:8px;color:#6fded5;flex-shrink:0}.idprom-saved-detail{flex:1;min-width:130px}.idprom-saved-detail strong{display:block;font-size:14px;color:#f0f7f8;line-height:1.5}.idprom-saved-detail time{display:block;font-size:12px;color:#a9bec8;margin:3px 0}.idprom-saved-detail small{font-size:11px;color:#68d9c9}.idprom-saved-actions{display:flex;gap:7px}.idprom-saved-open,.idprom-saved-delete,.idprom-saved-cancel{display:flex;gap:6px;align-items:center;justify-content:center;border-radius:8px;padding:9px 11px;font-size:12px;border:1px solid #42606b;background:#223b46;color:#e1f1f4}.idprom-saved-open{border-color:#51d8cf;background:#4edbcf;color:#102e35;font-weight:600}.idprom-saved-delete{border-color:#795054;background:#392f37;color:#f4afb4}.idprom-saved-confirm{width:100%;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;border-top:1px solid #3c515c;padding-top:12px;font-size:12px;color:#f0b5b8}.idprom-saved-confirm span{margin-right:auto}
 .idprom-saved-empty{padding:30px 12px;text-align:center;color:#abc1c9;font-size:14px;line-height:1.8;border:1px dashed #3c5662;border-radius:12px}.idprom-saved-status{font-size:13px;color:#bcece5;line-height:1.65;margin:14px 0 0}.idprom-saved-footer{margin-top:20px;padding-top:15px;border-top:1px solid #304752;display:flex;align-items:center;justify-content:space-between;gap:12px}.idprom-saved-footer small{font-size:12px;color:#a5bbc6;line-height:1.5}
 /* Keep this dialog within the viewport even inside a wide Studio canvas. */
 .idprom-saved-overlay{box-sizing:border-box;grid-template-columns:minmax(0,1fr);justify-items:center;min-width:0;overflow:hidden}
 .idprom-saved-dialog{min-width:0;width:min(580px,100%);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain}
 .idprom-saved-heading>div{min-width:0;flex:1;overflow-wrap:anywhere}
 .idprom-saved-detail{overflow-wrap:anywhere}
 @media(max-width:600px){
  .idprom-saved-overlay{display:flex;align-items:center;justify-content:center;width:100%;max-width:100vw;padding:12px}
  .idprom-saved-dialog{flex:0 1 auto;width:100%;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);min-width:0}
  .idprom-saved-heading{gap:10px}.idprom-saved-brand{width:36px;height:36px}
  .idprom-saved-heading p{overflow-wrap:anywhere}.idprom-saved-detail{min-width:0;flex:1 1 140px}
  .idprom-saved-actions{max-width:100%;flex-wrap:wrap}.idprom-saved-capacity-label{flex-wrap:wrap}
  .idprom-saved-footer{flex-wrap:wrap}.idprom-saved-full,.idprom-saved-confirm span{overflow-wrap:anywhere}
 }
 @media(max-width:600px){.idprom-saved-overlay{padding:12px}.idprom-saved-dialog{padding:18px;border-radius:16px}.idprom-saved-heading h2{font-size:20px}.idprom-saved-row{padding:12px;gap:10px}.idprom-saved-index{display:none}.idprom-saved-actions{margin-left:auto}.idprom-saved-open,.idprom-saved-delete{padding:9px}.idprom-saved-actions svg{width:17px;height:17px}}
 `}</style>
 <section ref={panel} className="idprom-saved-dialog" role="dialog" aria-modal="true" aria-labelledby="idprom-saved-title" aria-describedby="idprom-saved-description" aria-busy={busy||loading}>
 <header className="idprom-saved-heading"><span className="idprom-saved-brand"><Icon/></span><div><h2 id="idprom-saved-title">งานที่บันทึกไว้</h2><p id="idprom-saved-description">เปิดงานเดิมด้วยบัญชีอีเมลเดียวกัน</p></div><button className="idprom-saved-close" aria-label="ปิดรายการงาน" onClick={close}><Icon kind="close"/></button></header>
 <div className="idprom-saved-capacity"><div className="idprom-saved-capacity-label"><span>พื้นที่เก็บงานของคุณ</span><strong>{loading?'…':items.length} / {limit} งาน</strong></div><div className="idprom-saved-meter" aria-hidden="true"><span style={{width:Math.min(100,items.length/limit*100)+'%'}}/></div></div>
 {!loading&&items.length>=limit&&<p className="idprom-saved-full" role="alert"><strong>พื้นที่เก็บงานเต็มแล้ว</strong>ลบงานเก่าก่อนบันทึกงานใหม่ · ยังบันทึกทับงานเดิมได้</p>}
 <div className="idprom-saved-list">{items.map((item,index)=><article key={item.id} className="idprom-saved-row"><span className="idprom-saved-index"><Icon/></span><div className="idprom-saved-detail"><strong>{item.name||'รูป IDพร้อม'}</strong><time dateTime={item.updated_at}>{new Date(item.updated_at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'})}</time><small>เปิดแก้ไขต่อได้ · ไม่มีลายน้ำ</small></div><div className="idprom-saved-actions"><button className="idprom-saved-open" disabled={busy||loading||deleteId===item.id} onClick={()=>open(item.id)} aria-label={'เปิดงาน '+(index+1)}><Icon kind="open"/>เปิดงาน</button><button className="idprom-saved-delete" disabled={busy||loading} aria-label={'ลบงาน '+(index+1)} onClick={()=>setDeleteId(deleteId===item.id?null:item.id)}><Icon kind="trash"/>ลบ</button></div>{deleteId===item.id&&<div className="idprom-saved-confirm"><span>ลบงานนี้? เมื่อลบแล้วจะกู้คืนไม่ได้</span><button className="idprom-saved-cancel" disabled={busy} onClick={()=>setDeleteId(null)}>ยกเลิก</button><button className="idprom-saved-delete" disabled={busy} onClick={()=>remove(item.id)}>ยืนยันลบ</button></div>}</article>)}</div>
 {!loading&&!items.length&&!message&&<div className="idprom-saved-empty">ยังไม่มีงานที่บันทึกไว้<br/>กด “บันทึก” ใน Studio เพื่อเก็บงาน</div>}
 {message&&<p className="idprom-saved-status" role="status">{message}</p>}
 {canReload&&<button className="idprom-saved-cancel" disabled={busy||loading} onClick={()=>{setDeleteId(null);setRevision(value=>value+1)}}>โหลดรายการอีกครั้ง</button>}
 <footer className="idprom-saved-footer"><small>เก็บได้สูงสุด {limit} งานต่อบัญชี</small><button className="idprom-saved-cancel" onClick={close}>กลับไป Studio</button></footer>
 </section></div>;
}
