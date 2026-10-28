import crypto from 'node:crypto';
import {packageFor,checkoutPackage} from './package-rules.js';
import {verifyPaymentAmount,settleCheckout} from './stripe-payment-validation.js';
import {promptpayIntentStore} from './promptpay-intent-store.js';
const FLOW='idprom_promptpay_v1';
// Both basic prices remain recognizable for pending historical payments.
const CURRENT=new Set(['download_89_v1','download_119_v1','download_159_hair_v1']);
// Old unbound premium reservations used this description with their Stripe key.
const LEGACY_PREMIUM_DESCRIPTION='IDพร้อม — ดาวน์โหลดงานนี้ พร้อมปลดล็อกทรงผมหญิงทั้งหมด';
const publicPackageId=id=>id==='download_159_hair_v1'?'159':id==='download_89_v1'?'89':'119';
const keyFor=value=>crypto.createHash('sha256').update(value).digest('hex');
const warnReconciliation=error=>console.warn('IDPROM payment reconciliation pending',String(error?.code||'storage_unavailable').replace(/[^A-Za-z0-9_:-]/g,'').slice(0,40));
async function afterGrant(out,run){
 try{if(await run()!==false)return out}catch(error){warnReconciliation(error)}
 return {...out,reconciliationPending:true};
}
export async function reconcileDuplicatePayment(out,{receiptId,paymentIntentId,amount,stripePost,stripeGet,recordDownloadRefund}={}){
 if(!out?.overlap||!['pending','failed','manual_review'].includes(out.refundStatus)||!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId||'')||!stripePost||!recordDownloadRefund)return out;
 try{
  const refund=out.refundId&&stripeGet?await stripeGet('refunds/'+out.refundId):await stripePost('refunds',{payment_intent:paymentIntentId,amount,reason:'duplicate','metadata[idprom_overlap_receipt]':receiptId},keyFor('idprom-duplicate-refund-v1:'+receiptId));
  if(!/^re_[A-Za-z0-9]+$/.test(refund?.id||'')||!['pending','succeeded','failed','canceled','requires_action'].includes(refund.status)||refund.payment_intent!==paymentIntentId||refund.amount!==amount||refund.currency!=='thb')throw Error('invalid_refund_response');
  const status=refund.status==='requires_action'?'pending':refund.status;
  await recordDownloadRefund(receiptId,status,refund.id,status==='failed'?'provider_refund_failed':status==='canceled'?'provider_refund_canceled':'');
  return {...out,refundStatus:status,refundId:refund.id};
 }catch(error){try{await recordDownloadRefund(receiptId,'failed','',error.code||'refund_unavailable')}catch(storageError){warnReconciliation(storageError)}return {...out,refundStatus:'failed'}}
}
export async function settlePromptpay(intent,creditPaid,options={}){
 if(intent?.status!=='succeeded'||intent.metadata?.flow!==FLOW)throw Error('payment_not_paid');
 const {wallet_id:walletId,package_id:packageId,job_id:jobId=''}=intent.metadata;
 if(!walletId||!/^pi_[A-Za-z0-9]+$/.test(intent.id||'')||!['79_v2','89_image_v3','159_v4','159_v5','89_v4','159_v6','download_89_v1','download_119_v1','download_159_hair_v1'].includes(packageId))throw Error('invalid_payment_metadata');
 const offer=packageFor(packageId);
 verifyPaymentAmount(intent,offer);if(offer.requiresImage&&!jobId)throw Error('image_required');
 const out=await creditPaid(walletId,intent.id,packageId,jobId);
 const reconciled=await reconcileDuplicatePayment(out,{...options,receiptId:intent.id,paymentIntentId:intent.id,amount:intent.amount});
 if(CURRENT.has(packageId)&&options.onSettlement)return afterGrant(reconciled,()=>options.onSettlement(intent,reconciled));
 return reconciled;
}
function details(intent){const qr=intent.status==='requires_action'?intent.next_action?.promptpay_display_qr_code:null;return {paymentIntentId:intent.id,status:intent.status,amount:intent.amount/100,qrImage:qr?.image_url_png||null,expiresAt:qr?.expires_at||null,jobId:intent.metadata?.job_id||'',packageId:publicPackageId(intent.metadata?.package_id),packageKey:intent.metadata?.package_id}}
export function registerPromptpayApi(app,{stripePost,stripeGet,ensureWallet,getAiJobResult,creditPaid,isUnlocked=async()=>false,isPremium=async()=>false,scopeForJob=async(w,id)=>'job:'+id,walletRights=async()=>({}),intentStore=promptpayIntentStore,recordDownloadRefund,pendingDownloadRefunds=async()=>[],appUrl=''}={}){
 let reconciliationFlight=null;
 const settlementOptions={stripePost,stripeGet,recordDownloadRefund,onSettlement:intent=>reconcileSiblings(intent.metadata.wallet_id,intent.metadata.job_id,intent.id)};
 const covered=async(wid,job,offer)=>offer==='download_159_hair_v1'?isPremium(wid,job):isUnlocked(wid,job);
 const closeGranted=async(row,id,out)=>!row||out.reconciliationPending?out:afterGrant(out,()=>intentStore.close(row.id,id));
 const owned=async(req)=>{const id=String(req.params.id||'');if(!/^pi_[A-Za-z0-9]+$/.test(id))throw Error('invalid_payment_id');const intent=await stripeGet('payment_intents/'+id);if(!req.accountUser||intent.metadata?.wallet_id!==req.accountUser.wallet_id||intent.metadata?.flow!==FLOW)throw Error('payment_not_owned');return intent};
 const cancel=async intent=>{
  if(['canceled','succeeded','processing'].includes(intent.status))return intent;
  const stopped=await stripePost('payment_intents/'+intent.id+'/cancel',{},keyFor('idprom-cancel-v1:'+intent.id));
  if(!['canceled','succeeded','processing'].includes(stopped?.status))throw Error('payment_cancel_unconfirmed');return stopped;
 };
 const checkoutState=async row=>{
  // Stripe may prune an idempotency key after 24 hours. An unbound reservation
  // older than that window must be reconciled, never recreated blindly.
  if(!row.intent_id&&row.created_at&&Date.now()-new Date(row.created_at).getTime()>23*60*60*1000)throw Error('payment_recovery_required');
  const session=row.intent_id?await stripeGet('checkout/sessions/'+row.intent_id):await stripePost('checkout/sessions',row.payload,row.idempotency_key);
  if(!/^cs_[A-Za-z0-9_]+$/.test(session?.id||'')||session.metadata?.wallet_id!==row.wallet_id||session.metadata?.job_id!==row.job_id||session.metadata?.package_id!==row.package_id||session.mode!=='payment'||session.currency!=='thb'||session.amount_total!==packageFor(row.package_id).price*100)throw Error('payment_reservation_mismatch');
  if(session.url){const url=new URL(session.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error('invalid_checkout_url')}
  await intentStore.bind(row.id,{id:session.id,status:session.payment_status==='paid'?'succeeded':session.status||'open'});
  return session;
 };
 const settleSession=async(session,expectedWallet)=>{
  const out=await settleCheckout(session,creditPaid,expectedWallet);
  const reconciled=await reconcileDuplicatePayment(out,{...settlementOptions,receiptId:session.id,paymentIntentId:session.payment_intent,amount:session.amount_total});
  if(CURRENT.has(session.metadata?.package_id))return afterGrant(reconciled,()=>reconcileSiblings(session.metadata.wallet_id,session.metadata.job_id,session.id));
  return reconciled;
 };
 const resolve=async(intent,{row=null,requestedJobId=''}={})=>{
  const wid=intent.metadata?.wallet_id,jobId=intent.metadata?.job_id,offer=intent.metadata?.package_id;
  const scope=CURRENT.has(offer)?await scopeForJob(wid,jobId):null;
  if(intent.status==='succeeded'){
   const out=await closeGranted(row,intent.id,await settlePromptpay(intent,creditPaid,settlementOptions));
   return {...details(intent),ok:true,...out,workId:scope,...(requestedJobId?{requestedJobId}:{})};
  }
  if(CURRENT.has(offer)&&await covered(wid,jobId,offer)){
   const stopped=await cancel(intent);if(row)await intentStore.bind(row.id,stopped);
   if(stopped.status==='succeeded')return resolve(stopped,{row,requestedJobId});
   if(row&&stopped.status==='canceled')await intentStore.close(row.id,intent.id);
   return {...details(stopped),...await walletRights(wid),ok:true,status:'work_unlocked',paidElsewhere:true,unlocked:true,premiumHair:await isPremium(wid,jobId),qrImage:null,workId:scope,paymentProcessing:stopped.status==='processing',...(requestedJobId?{requestedJobId}:{})};
  }
  const expired=intent.next_action?.promptpay_display_qr_code?.expires_at;
  if((expired&&expired*1000<=Date.now())||intent.status==='requires_payment_method')intent=await cancel(intent);
  if(row){await intentStore.bind(row.id,intent);if(intent.status==='canceled')await intentStore.close(row.id,intent.id)}
  if(intent.status==='succeeded')return resolve(intent,{row,requestedJobId});
  return {...details(intent),ok:false,workId:scope,...(requestedJobId?{requestedJobId}:{})};
 };
 const getIntent=async row=>{
  if(row.intent_id)return stripeGet('payment_intents/'+row.intent_id);
  if(row.created_at&&Date.now()-new Date(row.created_at).getTime()>23*60*60*1000)throw Error('payment_recovery_required');
  const offer=packageFor(row.package_id);
  // Labels can change after a creation response is lost. Reuse the reserved
  // description, including the exact legacy value for older null-payload rows.
  const description=typeof row.payload?.description==='string'?row.payload.description:row.package_id==='download_159_hair_v1'?LEGACY_PREMIUM_DESCRIPTION:`IDพร้อม — ${offer.name}`;
  const intent=await stripePost('payment_intents',{amount:offer.price*100,currency:'thb','payment_method_types[0]':'promptpay','payment_method_data[type]':'promptpay','payment_method_data[billing_details][email]':row.email,confirm:'true',description,'metadata[flow]':FLOW,'metadata[wallet_id]':row.wallet_id,'metadata[package_id]':row.package_id,'metadata[job_id]':row.job_id},row.idempotency_key);
  if(!/^pi_[A-Za-z0-9]+$/.test(intent?.id||'')||intent.metadata?.flow!==FLOW||intent.metadata?.wallet_id!==row.wallet_id||intent.metadata?.package_id!==row.package_id||intent.metadata?.job_id!==row.job_id||intent.amount!==offer.price*100||intent.currency!=='thb')throw Error('payment_reservation_mismatch');
  await intentStore.bind(row.id,intent);return intent;
 };
 const locate=async intent=>{
  let row=await intentStore.findByIntent(intent.id);
  if(!row&&CURRENT.has(intent.metadata?.package_id)){
   const scope=await scopeForJob(intent.metadata.wallet_id,intent.metadata.job_id),adopted=await intentStore.adopt({walletId:intent.metadata.wallet_id,scope,intent});
   if(adopted.intent_id===intent.id)row=adopted;
   else if(intent.status!=='succeeded'&&intent.status!=='canceled'){
    // An old browser may poll a pre-coordinator intent while another device has
    // the canonical QR. Do not keep presenting two payable codes.
    intent=await cancel(intent);
    if(intent.status==='processing'){
     if(adopted.channel==='promptpay'){
      const canonical=await cancel(await getIntent(adopted));await intentStore.bind(adopted.id,canonical);
      if(canonical.status==='succeeded')await resolve(canonical,{row:adopted});
      else if(canonical.status==='canceled')await intentStore.close(adopted.id,canonical.id);
      if(canonical.status!=='processing'){const replacement=await intentStore.adopt({walletId:intent.metadata.wallet_id,scope,intent});if(replacement.intent_id===intent.id)row=replacement}
     }else{
      const session=await checkoutState(adopted);
      if(session.payment_status==='paid')await closeGranted(adopted,session.id,await settleSession(session));
      else if(session.status==='open'){
       const expired=await stripePost('checkout/sessions/'+session.id+'/expire',{},keyFor('idprom-checkout-expire-v1:'+session.id));
       if(expired.status!=='expired')throw Error('payment_cancel_unconfirmed');await intentStore.close(adopted.id,session.id);
      }
      if(session.status==='open'||session.status==='expired'||session.payment_status==='paid'){const replacement=await intentStore.adopt({walletId:intent.metadata.wallet_id,scope,intent});if(replacement.intent_id===intent.id)row=replacement}
     }
     return {intent:{...intent,next_action:null},row,conflict:true};
    }
   }
  }
  return {intent,row};
 };
 const reconcileWork=async({wallet_id:wid,work_scope:scope,paid_id:paidId})=>{
  try{
   const row=await intentStore.findActive(wid,scope);
   if(!row||!await covered(wid,row.job_id,row.package_id)){await intentStore.finishReconcile(wid,scope,'',paidId);return}
   if(row.intent_id===paidId){await intentStore.close(row.id,paidId);await intentStore.finishReconcile(wid,scope,'',paidId);return}
   if(row.channel==='checkout'){
    const session=await checkoutState(row);
    if(session.payment_status==='paid'){await intentStore.close(row.id,session.id);await settleSession(session)}
    else if(session.status==='open'){const expired=await stripePost('checkout/sessions/'+session.id+'/expire',{},keyFor('idprom-checkout-expire-v1:'+session.id));if(expired.status!=='expired')throw Error('payment_cancel_unconfirmed');await intentStore.close(row.id,session.id)}
    else if(session.status==='expired')await intentStore.close(row.id,session.id);
    else throw Error('payment_processing');
   }else{
    const intent=await cancel(await getIntent(row));await intentStore.bind(row.id,intent);
    if(intent.status==='succeeded'){await intentStore.close(row.id,intent.id);await settlePromptpay(intent,creditPaid,settlementOptions)}
    else if(intent.status==='canceled')await intentStore.close(row.id,intent.id);
    else throw Error('payment_processing');
   }
   await intentStore.finishReconcile(wid,scope,'',paidId);
  }catch(error){await intentStore.finishReconcile(wid,scope,error.code||error.message||'reconciliation_failed',paidId);console.warn('IDPROM payment reconciliation pending',String(error.code||'provider_unavailable').slice(0,40));return false}
 };
 const reconcileSiblings=async(wid,jobId,paidId)=>{
  // Grant already committed. A durable work item survives provider failure,
  // stopped browser timers and a process restart without weakening the grant.
  if(!intentStore.queueReconcile)return;
  try{const scope=await scopeForJob(wid,jobId);await intentStore.queueReconcile(wid,scope,jobId,paidId);return await reconcileWork({wallet_id:wid,work_scope:scope,paid_id:paidId})}
  catch(error){warnReconciliation(error);return false}
 };
 const reconcileReservation=async row=>{
  try{
   const checkout=row.channel==='checkout';
   if(!CURRENT.has(row.package_id)||!row.intent_id||(!checkout&&row.channel!=='promptpay')||!(checkout?/^cs_[A-Za-z0-9_]+$/:/^pi_[A-Za-z0-9]+$/).test(row.intent_id))throw Error('payment_reservation_mismatch');
   // Read the existing provider object only. Polling must never create a new
   // charge or cancel an unpaid/processing payment while the browser is away.
   const payment=await stripeGet((checkout?'checkout/sessions/':'payment_intents/')+row.intent_id);
   const amount=checkout?payment?.amount_total:payment?.amount;
   if(payment?.id!==row.intent_id||payment.metadata?.wallet_id!==row.wallet_id||payment.metadata?.job_id!==row.job_id||payment.metadata?.package_id!==row.package_id||payment.currency!=='thb'||!Number.isSafeInteger(amount)||amount!==packageFor(row.package_id).price*100||(checkout?payment.mode!=='payment':payment.metadata?.flow!==FLOW)||await scopeForJob(row.wallet_id,row.job_id)!==row.work_scope)throw Error('payment_reservation_mismatch');
   if(checkout?payment.payment_status==='paid':payment.status==='succeeded'){
    const out=checkout?await settleSession(payment,row.wallet_id):await settlePromptpay(payment,creditPaid,settlementOptions);
    await closeGranted(row,payment.id,out);
   }else{
    await intentStore.bind(row.id,{id:payment.id,status:payment.status});
    if(checkout?payment.status==='expired':payment.status==='canceled')await intentStore.close(row.id,payment.id);
   }
  }catch(error){warnReconciliation(error)}
 };
 app.post('/api/payments/promptpay',async(req,res)=>{try{
  res.set('Cache-Control','no-store');const user=req.accountUser;if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบใหม่'});
  const offer=checkoutPackage(req.body?.packageId),jobId=String(req.body?.jobId||'');
  const job=jobId&&await getAiJobResult(jobId,user.wallet_id);if(!job||job.status!=='completed')return res.status(400).json({error:'image_required',message:'กรุณาสร้างรูปให้สำเร็จก่อนปลดล็อกดาวน์โหลด'});
  const scope=await scopeForJob(user.wallet_id,jobId);await ensureWallet(user.wallet_id);
  const attempt=String(req.get('X-Checkout-Attempt')||'');if(!/^[A-Za-z0-9_-]{16,80}$/.test(attempt))return res.status(400).json({error:'invalid_attempt'});
  const pending=String(req.body?.pendingPaymentIntentId||'');
  if(pending){
   if(!/^pi_[A-Za-z0-9]+$/.test(pending))throw Error('invalid_payment_id');
   const old=await stripeGet('payment_intents/'+pending);
   if(old.metadata?.flow!==FLOW||old.metadata?.wallet_id!==user.wallet_id||!CURRENT.has(old.metadata?.package_id))throw Error('payment_not_owned');
   // A prior QR for a different work remains untouched. Recover the active
   // payment for this work from the server-side coordinator below.
   let oldScope;try{oldScope=await scopeForJob(user.wallet_id,old.metadata.job_id)}catch(error){if(error.status!==404)throw error}
   if(oldScope===scope){
   const adopted=await intentStore.adopt({walletId:user.wallet_id,scope,intent:old});
   if(adopted.intent_id===old.id){const out=await resolve(old,{row:adopted,requestedJobId:jobId});if((out.ok&&await covered(user.wallet_id,jobId,offer.id))||old.status==='processing'||(!out.ok&&out.status!=='canceled'))return res.json(out)}
   else if(old.status==='succeeded')await resolve(old,{requestedJobId:jobId});
   else if(old.status!=='canceled'){const stopped=await cancel(old);if(stopped.status==='succeeded')await resolve(stopped,{requestedJobId:jobId});else if(stopped.status==='processing'){await locate(stopped);return res.status(409).json({error:'payment_processing',message:'กำลังยืนยันรายการเดิม กรุณารอ ไม่ต้องจ่ายซ้ำ'})}}   }
  }
  if(await covered(user.wallet_id,jobId,offer.id))return res.status(409).json({error:'already_unlocked',message:'งานนี้ปลดล็อกแล้ว กรุณาดาวน์โหลดโดยไม่ต้องชำระซ้ำ'});
  let row=await intentStore.reserve({walletId:user.wallet_id,scope,packageId:offer.id,jobId,email:user.email,attempt,payload:{description:`IDพร้อม — ${offer.name}`}});
  if(row.channel==='checkout'){
   const session=await checkoutState(row);
   if(session.payment_status==='paid'){await closeGranted(row,session.id,await settleSession(session));if(await covered(user.wallet_id,jobId,offer.id))return res.status(409).json({error:'already_unlocked',message:'งานนี้ปลดล็อกแล้ว กรุณาดาวน์โหลดโดยไม่ต้องชำระซ้ำ'});row=await intentStore.reserve({walletId:user.wallet_id,scope,packageId:offer.id,jobId,email:user.email,attempt,payload:{description:`IDพร้อม — ${offer.name}`}})}
   else if(session.status==='expired'){await intentStore.close(row.id,session.id);row=await intentStore.reserve({walletId:user.wallet_id,scope,packageId:offer.id,jobId,email:user.email,attempt,payload:{description:`IDพร้อม — ${offer.name}`}})}
   else return res.status(409).json({error:'payment_pending_checkout',checkoutUrl:session.url,message:'มีรายการชำระเงินเดิมของงานนี้ กรุณาดำเนินการรายการเดิม ไม่ต้องจ่ายซ้ำ'});
   if(row.channel==='checkout')return res.status(409).json({error:'payment_finished',message:'ตรวจสอบรายการเดิมแล้ว กรุณาเริ่มรายการใหม่อีกครั้ง'});
  }
  let intent=await getIntent(row),out=await resolve(intent,{row,requestedJobId:jobId});
  if(out.ok&&row.package_id!==offer.id&&!await covered(user.wallet_id,jobId,offer.id)){
   row=await intentStore.reserve({walletId:user.wallet_id,scope,packageId:offer.id,jobId,email:user.email,attempt,payload:{description:`IDพร้อม — ${offer.name}`}});intent=await getIntent(row);out=await resolve(intent,{row,requestedJobId:jobId});
  }
  if(!out.ok&&!out.qrImage&&!['processing','canceled'].includes(out.status))throw Error('qr_unavailable');
  res.json(out);
 }catch(e){console.error('IDPROM checkout: QR create',e);if(e.message==='payment_recovery_required')return res.status(409).json({error:'payment_recovery_required',message:'ยังยืนยันรายการเดิมไม่ได้ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบรายการ ไม่ต้องชำระเงินซ้ำ'});res.status(e.message==='payment_not_owned'?403:400).json({error:'promptpay_create_failed',message:'สร้าง QR ไม่สำเร็จ กรุณาลองอีกครั้ง'})}});
 app.get('/api/payments/promptpay/:id',async(req,res)=>{try{
  res.set('Cache-Control','no-store');const found=await locate(await owned(req));
  const out=await resolve(found.intent,{row:found.row});
  res.json(found.conflict?{...out,qrImage:null,paymentProcessing:true}:out);
 }catch(e){console.error('IDPROM checkout: QR status',e);res.status(e.message==='payment_not_owned'?403:400).json({error:e.message,message:'ตรวจสอบการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง'})}});
 app.post('/api/payments/promptpay/:id/cancel',async(req,res)=>{try{
  const intent=await owned(req),row=await intentStore.findByIntent(intent.id);
  if(intent.status==='succeeded'||(CURRENT.has(intent.metadata?.package_id)&&await covered(req.accountUser.wallet_id,intent.metadata.job_id,intent.metadata.package_id)))return res.json(await resolve(intent,{row}));
  if(intent.status==='processing')return res.status(409).json({error:'payment_processing',message:'กำลังยืนยันยอด กรุณารอและตรวจสอบอีกครั้ง ไม่ต้องจ่ายซ้ำ'});
  const canceled=await cancel(intent);if(row){await intentStore.bind(row.id,canceled);if(canceled.status==='canceled')await intentStore.close(row.id,intent.id)}
  if(canceled.status==='succeeded')return res.json(await resolve(canceled,{row}));res.json({...details(canceled),ok:false});
 }catch(e){console.error('IDPROM checkout: QR cancel',e);res.status(400).json({error:'cancel_failed',message:'ยังปิดรายการเดิมไม่ได้ กรุณาตรวจสอบการชำระเงินอีกครั้ง'})}});
 app.get('/api/payments/promptpay/:id/image',async(req,res)=>{try{
  const found=await locate(await owned(req)),out=await resolve(found.intent,{row:found.row});if(out.ok||out.status==='canceled'||found.conflict)return res.status(409).json({error:'already_unlocked_or_closed',...out,qrImage:null});
  const raw=out.qrImage;if(!raw)return res.sendStatus(404);
  const url=new URL(raw);if(url.protocol!=='https:'||!['stripe.com','stripecdn.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('invalid_qr_host');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error('qr_download_failed');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>2*1024*1024)throw Error('qr_too_large');
  res.set({'Content-Type':'image/png','Content-Disposition':'attachment; filename="IDPROM-PromptPay.png"','Cache-Control':'no-store'}).send(bytes);
 }catch(e){console.error('IDPROM checkout: QR image',e);res.status(400).json({error:'qr_download_failed'})}});
 return {settleSession,settleIntent:intent=>settlePromptpay(intent,creditPaid,settlementOptions),retryReconciliations(){
  if(reconciliationFlight)return reconciliationFlight;
  reconciliationFlight=(async()=>{
  if(intentStore.pendingSettlements)for(const row of await intentStore.pendingSettlements())await reconcileReservation(row);
  if(intentStore.pendingReconciliations)for(const item of await intentStore.pendingReconciliations())await reconcileWork(item);
  for(const receipt of await pendingDownloadRefunds())try{
   const checkout=receipt.session_id.startsWith('cs_'),payment=await stripeGet((checkout?'checkout/sessions/':'payment_intents/')+receipt.session_id);
   if(payment.metadata?.wallet_id!==receipt.wallet_id||payment.metadata?.package_id!==receipt.package_id||!CURRENT.has(receipt.package_id)||await scopeForJob(receipt.wallet_id,payment.metadata.job_id)!==receipt.work_scope)throw Error('refund_receipt_mismatch');
   const out=checkout?await settleSession(payment):await settlePromptpay(payment,creditPaid,settlementOptions);
   if(out.refundStatus==='manual_review'&&recordDownloadRefund)await recordDownloadRefund(receipt.session_id,'failed','','refund_payment_intent_unavailable');
  }catch(error){if(recordDownloadRefund)await recordDownloadRefund(receipt.session_id,'failed','',error.code||'verification_unavailable');console.warn('IDPROM refund reconciliation pending',String(error.code||'verification_unavailable').slice(0,40))}
  })().finally(()=>{reconciliationFlight=null});return reconciliationFlight;
 },async checkout(req,res){try{
  const user=req.accountUser;if(!user)return res.status(401).json({error:'auth_required',message:'กรุณาเข้าสู่ระบบก่อนชำระเงิน'});
  const offer=checkoutPackage(req.body?.packageId),jobId=String(req.body?.jobId||'');const scope=await scopeForJob(user.wallet_id,jobId);
  if(await covered(user.wallet_id,jobId,offer.id))return res.status(409).json({error:'already_unlocked',message:'งานนี้ปลดล็อกแล้ว กรุณาดาวน์โหลดโดยไม่ต้องชำระซ้ำ'});
  await ensureWallet(user.wallet_id);const attempt=String(req.get('X-Checkout-Attempt')||crypto.randomBytes(18).toString('hex'));if(!/^[A-Za-z0-9_-]{16,80}$/.test(attempt))return res.status(400).json({error:'invalid_attempt'});
  const base=appUrl||`${req.protocol}://${req.get('host')}`,payload={mode:'payment','line_items[0][price_data][currency]':'thb','line_items[0][price_data][unit_amount]':offer.price*100,'line_items[0][price_data][product_data][name]':`IDพร้อม — ${offer.name}`,'line_items[0][quantity]':1,'payment_method_types[0]':'promptpay',success_url:`${base}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,cancel_url:`${base}/?payment=cancelled`,'metadata[wallet_id]':user.wallet_id,'metadata[package_id]':offer.id,'metadata[job_id]':jobId};
  const row=await intentStore.reserve({walletId:user.wallet_id,scope,packageId:offer.id,jobId,email:user.email,attempt,channel:'checkout',payload});
  if(row.channel!=='checkout')return res.status(409).json({error:'payment_pending_promptpay',paymentIntentId:row.intent_id,message:'มี QR ชำระเงินเดิมของงานนี้ กรุณากลับไปตรวจสอบรายการเดิม ไม่ต้องจ่ายซ้ำ'});
  const session=await checkoutState(row);
  if(session.payment_status==='paid'){const out=await closeGranted(row,session.id,await settleSession(session));return res.json({ok:true,status:'succeeded',...out,jobId:row.job_id})}
  if(session.status==='expired'){await intentStore.close(row.id,session.id);return res.status(409).json({error:'payment_expired',message:'รายการเดิมหมดอายุแล้ว กรุณาเริ่มรายการใหม่'})}
  res.json({url:session.url,packageId:publicPackageId(row.package_id),packageKey:row.package_id,jobId:row.job_id,workId:scope});
 }catch(error){console.error('Stripe checkout:',error);if(error.message==='payment_recovery_required')return res.status(409).json({error:'payment_recovery_required',message:'ยังยืนยันรายการเดิมไม่ได้ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบรายการ ไม่ต้องชำระเงินซ้ำ'});res.status(400).json({error:'checkout_failed',message:'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองอีกครั้ง'})}}};
}
