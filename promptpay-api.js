import crypto from 'node:crypto';
import {packageFor,checkoutPackage} from './package-rules.js';
const FLOW='idprom_promptpay_v1';
export async function settlePromptpay(intent,creditPaid){
 if(intent?.status!=='succeeded'||intent.metadata?.flow!==FLOW)throw Error('payment_not_paid');
 const {wallet_id:walletId,package_id:packageId,job_id:jobId=''}=intent.metadata;
 if(!walletId||!['79_v2','89_image_v3','159_v4'].includes(packageId))throw Error('invalid_payment_metadata');
 const offer=packageFor(packageId);
 if(intent.currency!=='thb'||intent.amount!==offer.price*100||intent.amount_received<intent.amount||(offer.requiresImage&&!jobId))throw Error('payment_amount_mismatch');
 return creditPaid(walletId,intent.id,packageId,jobId);
}
function details(intent){const qr=intent.next_action?.promptpay_display_qr_code;return {paymentIntentId:intent.id,status:intent.status,amount:intent.amount/100,qrImage:qr?.image_url_png||null,expiresAt:qr?.expires_at||null}}
export function registerPromptpayApi(app,{stripePost,stripeGet,ensureWallet,getAiJobResult,creditPaid}){
 const owned=async(req)=>{const id=String(req.params.id||'');if(!/^pi_[A-Za-z0-9]+$/.test(id))throw Error('invalid_payment_id');const intent=await stripeGet('payment_intents/'+id);if(!req.accountUser||intent.metadata?.wallet_id!==req.accountUser.wallet_id||intent.metadata?.flow!==FLOW)throw Error('payment_not_owned');return intent};
 app.post('/api/payments/promptpay',async(req,res)=>{try{
  const user=req.accountUser;if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบใหม่'});
  const offer=checkoutPackage(req.body?.packageId);if(!['79_v2','159_v4'].includes(offer.id))return res.status(400).json({error:'invalid_package',message:'เลือกแพ็กเกจ 89 หรือ 159 บาท'});
  let jobId=String(req.body?.jobId||'');if(jobId){const job=await getAiJobResult(jobId,user.wallet_id);if(!job||job.status!=='completed'||!String(job.usage_id).startsWith('trial_')){if(offer.id!=='159_v4')return res.status(400).json({error:'trial_image_required',message:'เลือกรูปทดลองที่ประมวลผลสำเร็จก่อนชำระเงิน'});jobId=''}}
  await ensureWallet(user.wallet_id);
  const attempt=String(req.get('X-Checkout-Attempt')||'');if(!/^[A-Za-z0-9_-]{16,80}$/.test(attempt))return res.status(400).json({error:'invalid_attempt'});
  const packageId=offer.id;
  const idempotencyKey=crypto.createHash('sha256').update(FLOW+user.wallet_id+attempt).digest('hex');
  const intent=await stripePost('payment_intents',{amount:offer.price*100,currency:'thb','payment_method_types[0]':'promptpay','payment_method_data[type]':'promptpay','payment_method_data[billing_details][email]':user.email,confirm:'true',description:`IDพร้อม — ${offer.name}`,'metadata[flow]':FLOW,'metadata[wallet_id]':user.wallet_id,'metadata[package_id]':packageId,'metadata[job_id]':jobId},idempotencyKey);
  if(!intent.next_action?.promptpay_display_qr_code?.image_url_png)throw Error('qr_unavailable');
  console.info('IDPROM checkout:',JSON.stringify({event:'qr_created',paymentIntentId:intent.id,packageId}));res.json(details(intent));
 }catch(e){console.error('IDPROM checkout: QR create',e);res.status(400).json({error:'promptpay_create_failed',message:'สร้าง QR ไม่สำเร็จ กรุณาลองอีกครั้ง'})}});
 app.get('/api/payments/promptpay/:id',async(req,res)=>{try{
  res.set('Cache-Control','no-store');const intent=await owned(req);
  if(intent.status==='succeeded'){const out=await settlePromptpay(intent,creditPaid);return res.json({...details(intent),ok:true,...out})}
  res.json({...details(intent),ok:false});
 }catch(e){console.error('IDPROM checkout: QR status',e);res.status(e.message==='payment_not_owned'?403:400).json({error:e.message,message:'ตรวจสอบการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง'})}});
 app.post('/api/payments/promptpay/:id/cancel',async(req,res)=>{try{
  const intent=await owned(req);
  if(intent.status==='succeeded'){const out=await settlePromptpay(intent,creditPaid);return res.json({...details(intent),ok:true,...out})}
  if(intent.status==='processing')return res.status(409).json({error:'payment_processing',message:'กำลังยืนยันยอด กรุณารอและตรวจสอบอีกครั้ง ไม่ต้องจ่ายซ้ำ'});
  const canceled=intent.status==='canceled'?intent:await stripePost('payment_intents/'+intent.id+'/cancel',{});
  res.json({status:canceled.status,ok:false});
 }catch(e){console.error('IDPROM checkout: QR cancel',e);res.status(400).json({error:'cancel_failed',message:'ยังปิดรายการเดิมไม่ได้ กรุณาตรวจสอบการชำระเงินอีกครั้ง'})}});
 app.get('/api/payments/promptpay/:id/image',async(req,res)=>{try{
  const intent=await owned(req);if(intent.status==='succeeded')return res.sendStatus(409);
  const raw=intent.next_action?.promptpay_display_qr_code?.image_url_png;if(!raw)return res.sendStatus(404);
  const url=new URL(raw);if(url.protocol!=='https:'||!['stripe.com','stripecdn.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('invalid_qr_host');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error('qr_download_failed');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('qr_too_large');
  res.set({'Content-Type':'image/png','Content-Disposition':'attachment; filename="IDPROM-PromptPay.png"','Cache-Control':'no-store'}).send(bytes);
 }catch(e){console.error('IDPROM checkout: QR image',e);res.status(400).json({error:'qr_download_failed'})}});
}
