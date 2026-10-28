import React,{useEffect,useRef,useState} from 'react';
import {deliverImage} from './image-download.js';
import {requestPromptpay} from './promptpay-request.js';
import './promptpay-panel.css';
export default function PromptpayPanel({payment,headers,onPaid,onExpired}){
 const [message,setMessage]=useState('รอการชำระเงิน'),[checking,setChecking]=useState(false),[expired,setExpired]=useState(false),[covered,setCovered]=useState(false),[imageError,setImageError]=useState(false),[downloading,setDownloading]=useState(false);
 const callbacks=useRef({headers,onPaid,onExpired});callbacks.current={headers,onPaid,onExpired};const checkRef=useRef(null),lifecycleRef=useRef(null),downloadRef=useRef(null),actionRef=useRef(null),coveredRef=useRef(false);
 useEffect(()=>{
  let stopped=false,activeCheck=null,finished=false,settling=false,automaticStopped=false,timer,resume;const lifecycle=new AbortController();lifecycleRef.current=lifecycle;downloadRef.current=null;actionRef.current=null;
  const stopAutomaticPolling=()=>{automaticStopped=true;clearInterval(timer);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume)};
  coveredRef.current=false;setCovered(false);setExpired(false);setImageError(false);setDownloading(false);setMessage('รอการชำระเงิน');
  const check=async(replace=false)=>{if(stopped||finished||settling||actionRef.current||(!replace&&activeCheck))return;activeCheck?.abort();const request=new AbortController();activeCheck=request;setChecking(true);
   try{const {response:r,data}=await requestPromptpay('/api/payments/promptpay/'+encodeURIComponent(payment.paymentIntentId),{headers:callbacks.current.headers(),signal:request.signal});if(!r.ok)throw Error(r.status===401?'กรุณาปิดหน้าต่างแล้วเข้าสู่ระบบใหม่ เพื่อตรวจรายการเดิม':data?.message||'ตรวจสอบไม่สำเร็จ');
    if(stopped||request.signal.aborted||activeCheck!==request)return;
    if(!data||typeof data!=='object')throw Error('ตรวจสอบรายการไม่สำเร็จ กรุณาลองอีกครั้ง ไม่ต้องชำระเงินซ้ำ');
    if(data.ok===true&&['succeeded','work_unlocked'].includes(data.status)){coveredRef.current=true;setCovered(true);settling=true;setMessage('งานนี้ปลดล็อกแล้ว กำลังตรวจสอบสิทธิ์ดาวน์โหลด…');try{await callbacks.current.onPaid(data,payment);if(!stopped&&!request.signal.aborted&&activeCheck===request)finished=true}finally{settling=false}return}
    if(data.status==='canceled'||data.status==='expired'||(data.expiresAt&&Date.now()>=data.expiresAt*1000&&data.status!=='processing')){if(data.status==='canceled'||data.status==='expired')stopAutomaticPolling();setExpired(true);setMessage('QR หมดอายุแล้ว กรุณาตรวจสอบยอดก่อนสร้างรายการใหม่');return}
    setMessage(data.status==='processing'?'กำลังยืนยันการชำระเงิน…':'รอการชำระเงิน');
   }catch(e){if(!stopped&&!request.signal.aborted&&activeCheck===request)setMessage(e.message||'ตรวจสอบไม่สำเร็จ กดตรวจสอบอีกครั้ง')}finally{if(activeCheck===request){activeCheck=null;if(!stopped)setChecking(false)}}
  };
  checkRef.current=()=>check(true);void check();timer=setInterval(()=>{if(!automaticStopped&&document.visibilityState==='visible')void check()},5000);
  // A request suspended by iOS may still appear pending when the tab returns.
  resume=()=>{if(!automaticStopped&&document.visibilityState==='visible')void check(true)};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  return()=>{stopped=true;activeCheck?.abort();lifecycle.abort();stopAutomaticPolling();checkRef.current=null;if(lifecycleRef.current===lifecycle)lifecycleRef.current=null};
 },[payment.paymentIntentId]);
 const download=async()=>{const lifecycle=lifecycleRef.current;if(!lifecycle||lifecycle.signal.aborted||downloadRef.current||coveredRef.current)return;const task={};downloadRef.current=task;setDownloading(true);
  try{setMessage('กำลังเตรียม QR…');const {response:r,data:blob}=await requestPromptpay('/api/payments/promptpay/'+encodeURIComponent(payment.paymentIntentId)+'/image',{headers:callbacks.current.headers(),signal:lifecycle.signal,read:'blob'});if(lifecycle.signal.aborted||lifecycleRef.current!==lifecycle||coveredRef.current)return;if(r.status===409){setMessage('กำลังตรวจสอบรายการเดิม ไม่ต้องชำระเงินซ้ำ');await checkRef.current?.();return}if(!r.ok||!blob?.size)throw Error('บันทึก QR ไม่สำเร็จ กรุณาลองอีกครั้งหรือถ่ายภาพหน้าจอแทน');const delivery=deliverImage(blob,'IDPROM-PromptPay.png');setMessage(delivery==='panel'?'QR พร้อมแล้ว กดบันทึกหรือแชร์ในหน้าต่างรูป แล้วเปิดแอปธนาคารเลือก QR ที่บันทึก':'ส่งคำขอบันทึก QR แล้ว ตรวจไฟล์ที่บันทึกก่อนเปิดแอปธนาคาร')}
  catch(e){if(!lifecycle.signal.aborted&&lifecycleRef.current===lifecycle)setMessage(e.message||'เตรียม QR ไม่สำเร็จ กรุณาลองอีกครั้ง')}
  finally{if(downloadRef.current===task){downloadRef.current=null;if(!lifecycle.signal.aborted)setDownloading(false)}}
 };
 const changePackage=async()=>{const lifecycle=lifecycleRef.current;if(!lifecycle||lifecycle.signal.aborted||actionRef.current||checking)return;const task={};actionRef.current=task;setChecking(true);
  try{await callbacks.current.onExpired(payment)}
  catch(e){if(!lifecycle.signal.aborted&&lifecycleRef.current===lifecycle)setMessage(e.message||'ยังเปลี่ยนแพ็กเกจไม่ได้ กรุณาตรวจรายการเดิมอีกครั้ง')}
  finally{if(actionRef.current===task){actionRef.current=null;if(!lifecycle.signal.aborted&&lifecycleRef.current===lifecycle)setChecking(false)}}
 };
 return <div className="idprom-qr-panel"><h2>สแกนจ่าย PromptPay</h2><strong className="idprom-qr-amount">{payment.amount} บาท</strong>{!expired&&!covered&&<>{imageError?<p role="alert">โหลดภาพ QR ไม่สำเร็จ <button onClick={()=>{setImageError(false)}}>โหลดอีกครั้ง</button></p>:<img className="idprom-qr-image" src={payment.qrImage} alt={`QR ชำระเงิน ${payment.amount} บาท`} onError={()=>setImageError(true)}/>}<p className="idprom-qr-help"><strong>เปิดแอปธนาคาร → สแกน QR Code → ยืนยันชำระเงิน</strong><br/>จากนั้นกลับมาหน้านี้ รอระบบยืนยันยอด<br/>หน้าต่างจะปิดอัตโนมัติเมื่อปลดล็อกลายน้ำสำเร็จ</p><button className="idprom-qr-save" disabled={downloading} onClick={download}>{downloading?'กำลังเตรียม QR…':'บันทึก QR'}</button></>}<p className="idprom-qr-status" role="status">{message}</p><div className="idprom-qr-actions"><button className="idprom-qr-check" disabled={checking} onClick={()=>checkRef.current?.()}>{checking?'กำลังตรวจสอบ…':'ตรวจสอบการชำระเงิน'}</button><button className="idprom-qr-check" disabled={checking} onClick={changePackage}>{covered?'กลับไปยังรูป':expired?'กลับไปเลือกแพ็กเกจ':'เปลี่ยนแพ็กเกจ'}</button></div><small>จ่ายแล้วไม่ต้องสแกนซ้ำ · สิทธิ์อัปเดตเมื่อยืนยันยอดสำเร็จ</small><p className="idprom-qr-stay-notice"><span aria-hidden="true">!</span><strong>กรุณาอย่าปิดหน้านี้เองระหว่างรอยืนยันการชำระเงิน</strong></p></div>;
}




