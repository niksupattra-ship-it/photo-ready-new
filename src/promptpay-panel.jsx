import React,{useEffect,useRef,useState} from 'react';
import './promptpay-panel.css';
export default function PromptpayPanel({payment,headers,onPaid,onExpired}){
 const [message,setMessage]=useState('รอการชำระเงิน'),[checking,setChecking]=useState(false),[expired,setExpired]=useState(false),[imageError,setImageError]=useState(false);
 const callbacks=useRef({headers,onPaid,onExpired});callbacks.current={headers,onPaid,onExpired};const checkRef=useRef(null);
 useEffect(()=>{
  let stopped=false,inFlight=false,finished=false,timer;const controller=new AbortController();
  const check=async()=>{if(stopped||inFlight||finished)return;inFlight=true;setChecking(true);
   try{const r=await fetch('/api/payments/promptpay/'+encodeURIComponent(payment.paymentIntentId),{headers:callbacks.current.headers(),cache:'no-store',signal:controller.signal});const data=await r.json();if(!r.ok)throw Error(r.status===401?'กรุณาปิดหน้าต่างแล้วเข้าสู่ระบบใหม่ เพื่อตรวจรายการเดิม':data.message||'ตรวจสอบไม่สำเร็จ');
    if(stopped)return;
    if(data.ok===true&&data.status==='succeeded'){finished=true;setMessage('ชำระเงินสำเร็จ');await callbacks.current.onPaid(data);return}
    if(data.status==='canceled'||(data.expiresAt&&Date.now()>=data.expiresAt*1000)){setExpired(true);setMessage('QR หมดอายุแล้ว กรุณาตรวจสอบยอดก่อนสร้างรายการใหม่');return}
    setMessage(data.status==='processing'?'กำลังยืนยันการชำระเงิน…':'รอการชำระเงิน');
   }catch(e){if(!stopped)setMessage(e.message||'ตรวจสอบไม่สำเร็จ กดตรวจสอบอีกครั้ง')}finally{inFlight=false;if(!stopped)setChecking(false)}
  };
  checkRef.current=check;void check();timer=setInterval(()=>{if(document.visibilityState==='visible')void check()},5000);
  const resume=()=>{if(document.visibilityState==='visible')void check()};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  return()=>{stopped=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);checkRef.current=null};
 },[payment.paymentIntentId]);
 const download=async()=>{try{setMessage('กำลังบันทึก QR…');const r=await fetch('/api/payments/promptpay/'+encodeURIComponent(payment.paymentIntentId)+'/image',{headers:callbacks.current.headers()});if(!r.ok)throw Error('บันทึก QR ไม่สำเร็จ กรุณาถ่ายภาพหน้าจอแทน');const blob=await r.blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='IDPROM-PromptPay.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setMessage('เปิดแอปธนาคาร → สแกน → เลือกรูป QR ที่บันทึก')}catch(e){setMessage(e.message)}};
 return <div className="idprom-qr-panel"><h2>สแกนจ่าย PromptPay</h2><strong className="idprom-qr-amount">{payment.amount} บาท</strong>{!expired&&<>{imageError?<p role="alert">โหลดภาพ QR ไม่สำเร็จ <button onClick={()=>{setImageError(false)}}>โหลดอีกครั้ง</button></p>:<img className="idprom-qr-image" src={payment.qrImage} alt={`QR ชำระเงิน ${payment.amount} บาท`} onError={()=>setImageError(true)}/>}<p className="idprom-qr-help">ใช้มือถือเครื่องเดียว: บันทึก QR<br/>เปิดแอปธนาคาร → สแกน → เลือกรูป</p><button className="idprom-qr-save" onClick={download}>บันทึก QR</button></>}<p className="idprom-qr-status" role="status">{message}</p><button className="idprom-qr-check" disabled={checking} onClick={()=>checkRef.current?.()}>{checking?'กำลังตรวจสอบ…':'ตรวจสอบการชำระเงิน'}</button><button className="idprom-qr-check" disabled={checking} onClick={async()=>{setChecking(true);try{await onExpired()}catch(e){setMessage(e.message)}finally{setChecking(false)}}}>{expired?'กลับไปเลือกแพ็กเกจ':'เปลี่ยนแพ็กเกจ'}</button><small>จ่ายแล้วไม่ต้องสแกนซ้ำ · สิทธิ์เพิ่มเมื่อยืนยันยอดสำเร็จ</small></div>;
}
