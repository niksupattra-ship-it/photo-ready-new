import React,{useEffect,useRef,useState} from 'react';
import {hasWalletBalance} from './wallet-refresh.js';
export function rightsSummary(data,unlimited=false){
 const count=value=>Math.max(0,Math.floor(Number(value)||0));
 return {credits:unlimited?'∞':count(data.processRemaining??data.generationRemaining),trial:'∞'};
}
export function StudioRightsDialog({request,headers,onRights,onClose,onPackages,unlimited=false,initialData=null,refresh=null,accountScope=''}){
 const [data,setData]=useState(()=>hasWalletBalance(initialData)?initialData:null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const panel=useRef(null),callbacks=useRef({request,headers,onRights,refresh,initialData});callbacks.current={request,headers,onRights,refresh,initialData};
 useEffect(()=>{const previous=document.activeElement;panel.current?.querySelector('button')?.focus();return()=>previous?.focus?.()},[]);
 // An authoritative payment/usage update can arrive while a read is pending.
 // Adopt its scoped balance without starting another request on each render.
 useEffect(()=>{if(hasWalletBalance(initialData))setData(initialData)},[accountScope,initialData?.processRemaining,initialData?.generationRemaining,initialData?.trialRemaining,initialData?.trialAvailable,initialData?.hasPurchased]);
 useEffect(()=>{let cancelled=false;setData(hasWalletBalance(initialData)?initialData:null);setLoading(true);setError('');
  const version=value=>JSON.stringify([value?.walletId??'',value?.processRemaining??value?.generationRemaining??null,value?.trialRemaining??null,value?.trialAvailable??null,value?.hasPurchased??null]);
  const requestedVersion=version(callbacks.current.initialData),current=()=>!cancelled&&version(callbacks.current.initialData)===requestedVersion;
  (async()=>{
  try{const c=callbacks.current;let next;
   if(c.refresh)next=await c.refresh();
   else{
    const r=await c.request('/api/wallet/balance',{headers:c.headers(),cache:'no-store'},8000);
    if(r.status===401)throw Error('กรุณาเข้าสู่ระบบด้วยบัญชีที่รับเครดิตไว้');
    next=await r.json();if(!r.ok)throw Error(next.message||'โหลดเครดิตไม่สำเร็จ กรุณาลองใหม่');
   }
   if(!hasWalletBalance(next))throw Error('ยังตรวจสอบยอดเครดิตไม่ได้ กรุณาลองใหม่');
   if(current()){setData(next);if(!c.refresh)c.onRights(next)}
  }catch(e){if(current()&&e.code!=='WALLET_REFRESH_SUPERSEDED')setError(e.message||'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')}
  finally{if(!cancelled)setLoading(false)}
 })();return()=>{cancelled=true}},[revision,accountScope]);
 const displayData=data||(hasWalletBalance(initialData)?initialData:null),balance=displayData?rightsSummary(displayData,unlimited):null;
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'){const buttons=[...panel.current.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};
 return <div className="studio-rights-overlay" onKeyDown={keys} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
  <style>{`.studio-rights-overlay{position:fixed;inset:0;z-index:32000;display:grid;place-items:center;background:#061019bf;padding:16px;box-sizing:border-box}.studio-rights-card,.studio-rights-card *{box-sizing:border-box}.studio-rights-card{width:min(420px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid #375a68;border-radius:20px;background:#142630;color:#ecf8fa;box-shadow:0 18px 65px #0008;font-family:inherit}.studio-rights-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.studio-rights-heading h2{font-size:23px;margin:0}.studio-rights-card button{font:inherit;cursor:pointer}.studio-rights-close{border:1px solid #45616d;border-radius:9px;background:#213b47;color:#effaff;width:34px;height:34px;font-size:23px!important}.studio-rights-brand{margin:10px 0 20px;color:#a8c7d0;font-size:13px}.studio-rights-row{display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #365561;background:#1c3440;padding:16px;border-radius:13px;margin-bottom:12px}.studio-rights-row span{font-size:14px;line-height:1.6}.studio-rights-row small{display:block;color:#a8c7d0;font-size:12px}.studio-rights-count{font-size:27px;color:#68dfd9;white-space:nowrap}.studio-rights-count small{font-size:12px;text-align:center;font-weight:400}.studio-rights-note{font-size:13px;line-height:1.75;color:#b6cdd5;margin:18px 0}.studio-rights-status{font-size:14px;line-height:1.7;margin:18px 0;color:#c4e7ed}.studio-rights-error{color:#ffc1b9}.studio-rights-packages,.studio-rights-retry{width:100%;padding:12px 16px;border:1px solid #63d8d0;border-radius:11px;background:#55d7ce;color:#102d37;font-weight:700!important}.studio-rights-retry{background:transparent;color:#b5f1ed;margin-bottom:12px}.studio-rights-card button:focus-visible{outline:2px solid #a2fff1;outline-offset:3px}@media(max-width:1100px),(pointer:coarse) and (max-width:1366px){.studio-rights-overlay{padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}.studio-rights-card{padding:20px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.studio-rights-close{width:44px;height:44px;flex:0 0 44px}.studio-rights-packages,.studio-rights-retry{min-height:48px;touch-action:manipulation}}@media(max-width:360px){.studio-rights-card{padding:16px}.studio-rights-heading h2{font-size:20px}.studio-rights-row{padding:12px;gap:10px}.studio-rights-count{font-size:24px}}`}</style>
  <section ref={panel} className="studio-rights-card" role="dialog" aria-modal="true" aria-labelledby="studio-rights-title" aria-busy={loading}>
   <div className="studio-rights-heading"><h2 id="studio-rights-title">สิทธิ์ดาวน์โหลดคงเหลือ</h2><button className="studio-rights-close" onClick={onClose} aria-label="ปิดเครดิตคงเหลือ">×</button></div>
   <p className="studio-rights-brand">IDพร้อม Studio</p>
   {loading&&!displayData?<p className="studio-rights-status" role="status">กำลังตรวจสอบเครดิตล่าสุด…</p>:!displayData?<><p className="studio-rights-status studio-rights-error" role="alert">{error||'ยังตรวจสอบยอดเครดิตไม่ได้ กรุณาลองใหม่'}</p><button className="studio-rights-retry" onClick={()=>setRevision(v=>v+1)}>ตรวจสอบอีกครั้ง</button></>:<>
    {loading&&<p className="studio-rights-status" role="status">ยอดที่แสดงเป็นข้อมูลล่าสุดที่โหลดไว้ กำลังอัปเดต…</p>}
    {error&&<><p className="studio-rights-status studio-rights-error" role="alert">ยังอัปเดตยอดไม่ได้ ยอดที่แสดงอาจเปลี่ยนแปลง กรุณาลองใหม่</p><button className="studio-rights-retry" onClick={()=>setRevision(v=>v+1)}>ตรวจสอบอีกครั้ง</button></>}
    <div className="studio-rights-row"><span>สิทธิ์จากเครดิตเดิม<small>ปลดล็อกดาวน์โหลดงานใหม่</small></span><strong className="studio-rights-count">{balance.credits}<small>ครั้ง</small></strong></div>
    <div className="studio-rights-row"><span>สร้างและเปลี่ยนผมฟรี<small>มีลายน้ำจนกว่าจะปลดล็อก</small></span><strong className="studio-rights-count">{balance.trial}<small>ครั้ง</small></strong></div>
    <p className="studio-rights-note">สร้างภาพไม่หักสิทธิ์ ใช้ 1 สิทธิ์ปลดล็อก 1 งานแล้วดาวน์โหลดซ้ำได้ทุกขนาด งานเก่าที่เปิดจากรายการบันทึกเดิมยังดาวน์โหลดได้โดยไม่หักสิทธิ์</p>
   </>}
   <button className="studio-rights-packages" onClick={onPackages}>ปลดล็อกดาวน์โหลด</button>
  </section>
 </div>;
}



