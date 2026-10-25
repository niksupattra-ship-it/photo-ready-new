import crypto from 'node:crypto';
import {packageFor} from './package-rules.js';

export function verifyStripeSignature(raw,header,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||typeof header!=='string'||!secret)return false;
 const parts=header.split(',').map(part=>part.trim().split('=',2));
 const timestamp=parts.find(([key])=>key==='t')?.[1];
 if(!/^\d+$/.test(timestamp||'')||!Number.isSafeInteger(Number(timestamp))||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected=crypto.createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
 // Stripe sends multiple v1 values while rotating webhook signing secrets.
 return parts.some(([key,value])=>key==='v1'&&/^[a-f0-9]{64}$/i.test(value||'')&&crypto.timingSafeEqual(expected,Buffer.from(value,'hex')));
}

export function verifyPaymentAmount(payment,offer,{checkout=false}={}){
 const amount=checkout?payment.amount_total:payment.amount;
 if(payment.currency!=='thb'||!Number.isSafeInteger(amount)||amount!==offer.price*100||(!checkout&&(!Number.isSafeInteger(payment.amount_received)||payment.amount_received<amount)))throw Error('payment_amount_mismatch');
}

export async function settleCheckout(session,creditPaid,expectedWalletId){
 if(session?.payment_status!=='paid')throw Object.assign(Error('payment_not_paid'),{status:409});
 const walletId=String(session.metadata?.wallet_id||'');
 if(expectedWalletId!==undefined&&walletId!==expectedWalletId)throw Object.assign(Error('wallet_mismatch'),{status:403});
 if(!walletId||session.mode!=='payment'||!/^cs_[A-Za-z0-9_]+$/.test(session.id||''))throw Error('invalid_payment_metadata');
 // Missing package metadata belongs to the original 149-baht Checkout flow.
 const packageId=String(session.metadata?.package_id||'149'),offer=packageFor(packageId),jobId=String(session.metadata?.job_id||'');
 if(offer.requiresImage&&!jobId)throw Error('image_required');
 verifyPaymentAmount(session,offer,{checkout:true});
 return creditPaid(walletId,session.id,packageId,jobId);
}
