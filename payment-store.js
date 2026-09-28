import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dataFile=process.env.PAYMENT_DATA_FILE || path.join(process.cwd(),'.data','payments.json');
let queue=Promise.resolve();
function blank(){return {wallets:{},payments:{},usage:{}}}
function read(){try{return JSON.parse(fs.readFileSync(dataFile,'utf8'))}catch{return blank()}}
function write(db){fs.mkdirSync(path.dirname(dataFile),{recursive:true});const tmp=dataFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,dataFile)}
function locked(fn){const job=queue.then(()=>fn());queue=job.catch(()=>{});return job}
export function newWallet(){return locked(()=>{const db=read(),id='wal_'+crypto.randomBytes(24).toString('hex');db.wallets[id]={credits:0,createdAt:new Date().toISOString()};write(db);return {walletId:id,credits:0}})}
export function getWallet(id){const db=read(),w=db.wallets[id];return w?{walletId:id,credits:Number(w.credits||0)}:null}
export function ensureWallet(id){return locked(()=>{const db=read();if(!db.wallets[id])db.wallets[id]={credits:0,createdAt:new Date().toISOString()};write(db);return {walletId:id,credits:Number(db.wallets[id].credits||0)}})}
export function creditPaid(walletId,sessionId,amount=2){return locked(()=>{const db=read();if(db.payments[sessionId])return {duplicate:true,credits:Number(db.wallets[walletId]?.credits||0)};if(!db.wallets[walletId])db.wallets[walletId]={credits:0,createdAt:new Date().toISOString()};db.wallets[walletId].credits=Number(db.wallets[walletId].credits||0)+amount;db.payments[sessionId]={walletId,credits:amount,at:new Date().toISOString()};write(db);return {duplicate:false,credits:db.wallets[walletId].credits}})}
export function reserveCredit(walletId,kind){return locked(()=>{const db=read(),w=db.wallets[walletId];if(!w||Number(w.credits||0)<1)return null;w.credits-=1;const id='use_'+crypto.randomBytes(18).toString('hex');db.usage[id]={walletId,kind,status:'reserved',at:new Date().toISOString()};write(db);return {usageId:id,credits:w.credits}})}
export function commitCredit(usageId){return locked(()=>{const db=read(),u=db.usage[usageId];if(u&&u.status==='reserved'){u.status='used';u.completedAt=new Date().toISOString();write(db)}return true})}
export function refundCredit(usageId){return locked(()=>{const db=read(),u=db.usage[usageId];if(!u||u.status!=='reserved')return false;const w=db.wallets[u.walletId];if(w)w.credits=Number(w.credits||0)+1;u.status='refunded';u.refundedAt=new Date().toISOString();write(db);return true})}
export function walletHistory(walletId){const db=read();const rows=[];for(const [id,p] of Object.entries(db.payments))if(p.walletId===walletId)rows.push({id,type:'purchase',credits:p.credits,at:p.at});for(const [id,u] of Object.entries(db.usage))if(u.walletId===walletId)rows.push({id,type:u.status==='refunded'?'refund':'usage',kind:u.kind,credits:u.status==='refunded'?1:-1,at:u.refundedAt||u.completedAt||u.at});return rows.sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,30)}
