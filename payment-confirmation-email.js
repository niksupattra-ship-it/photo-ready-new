import pg from 'pg';
import {packageFor} from './package-rules.js';

// Separate, best-effort notification store. Payment/credit settlement never depends on this.
const {Pool}=pg;
let pool;
function db(){
 if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000,ssl:process.env.DATABASE_URL?.includes('localhost')?false:{rejectUnauthorized:false},max:2});
 return pool;
}
function validEmail(value){
 const email=String(value||'').trim().toLowerCase();
 return email.length<=254&&/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)?email:null;
}
export async function sendPaymentConfirmation({id,email,packageId}){
 const key=process.env.CONTACT_RESEND_API_KEY;
 const recipient=validEmail(email);
 if(!key||!recipient||!/^((cs|pi)_[A-Za-z0-9_]+)$/.test(String(id||'')))return;
 const offer=packageFor(packageId);
 // A short lease prevents concurrent webhook, polling and return-confirmation emails.
 // Failed sends can be retried by subsequent verified settlement events.
 const client=db();
 await client.query(`CREATE TABLE IF NOT EXISTS payment_email_notifications (
  payment_id text PRIMARY KEY, recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending', claimed_at timestamptz,
  sent_at timestamptz, resend_id text
 )`);
 await client.query("INSERT INTO payment_email_notifications(payment_id,recipient) VALUES($1,$2) ON CONFLICT(payment_id) DO NOTHING",[id,recipient]);
 const claim=await client.query(`UPDATE payment_email_notifications SET status='sending',claimed_at=now()
  WHERE payment_id=$1 AND (status='pending' OR (status='sending' AND claimed_at<now()-interval '2 minutes'))
  RETURNING recipient`,[id]);
 if(!claim.rowCount)return;
 const text=`ขอบคุณที่ใช้บริการ IDพร้อม

เราได้รับชำระเงินของคุณเรียบร้อยแล้ว
รายการ: ${offer.name||'แพ็กเกจ IDพร้อม'}
ยอดชำระ: ${offer.price} บาท
หมายเลขรายการ: ${id}

สิทธิ์ของคุณได้รับการดำเนินการในบัญชี IDพร้อมแล้ว
เข้าใช้งาน: https://idpromth.com

หากมีข้อสงสัย ติดต่อ contact@idpromth.com
(ข้อความนี้เป็นการยืนยันจาก IDพร้อมเพิ่มเติมจากใบเสร็จของ Stripe)`;
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',signal:AbortSignal.timeout(10000),
   headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`idprom-payment-${id}`},
   body:JSON.stringify({from:'IDพร้อม <contact@idpromth.com>',to:[recipient],subject:'ยืนยันการชำระเงินสำเร็จ — IDพร้อม',text})
  });
  if(!response.ok)throw Error('resend_http_'+response.status);
  const result=await response.json();
  await client.query("UPDATE payment_email_notifications SET status='sent',sent_at=now(),resend_id=$2 WHERE payment_id=$1",[id,String(result.id||'')]);
 }catch(error){
  await client.query("UPDATE payment_email_notifications SET status='pending',claimed_at=NULL WHERE payment_id=$1 AND status='sending'",[id]).catch(()=>{});
  throw error;
 }
}
export async function notifyPaymentSafely(details){
 try{await sendPaymentConfirmation(details)}catch(e){console.error('Payment confirmation email failed:',e?.message||'unknown_error')}
}
