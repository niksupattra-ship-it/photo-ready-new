// Local PostgreSQL only, isolated disposable schema. No real accounts/payments.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import sharp from 'sharp';
import {createPurchasedPhotoStore} from '../purchased-photo-store.js';
import {registerPurchasedPhotoApi} from '../purchased-photo-api.js';
const connection=process.env.PHOTO_TEST_DATABASE_URL||'postgresql://photo_ready@127.0.0.1:55432/photo_ready';
assert(['127.0.0.1','localhost'].includes(new URL(connection).hostname),'Tests require a local database');
const schema='photo_test_'+crypto.randomBytes(8).toString('hex');
const db=new pg.Client({connectionString:connection,ssl:false});await db.connect();
let server,passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
try{
 await db.query(`CREATE SCHEMA ${schema}`);await db.query(`SET search_path TO ${schema}`);
 await db.query('CREATE TABLE paid_image_unlocks(wallet_id text,job_id text,created_at timestamptz DEFAULT clock_timestamp())');
 await db.query("INSERT INTO paid_image_unlocks(wallet_id,job_id) VALUES('a','job_a'),('b','job_b'),('a','job_c')");
 const store=createPurchasedPhotoStore(db),allowed=new Set(['a:job_a','b:job_b','a:job_c']);
 const policy={allowedJobs:async(w,ids)=>ids.every(id=>allowed.has(w+':'+id)),scopeForJob:async(w,id)=>'work_'+id,jobIds:async(w,id)=>[id],premiumHair:async(w,id)=>id==='job_c'};
 const app=express();app.use((req,res,next)=>{const token=req.get('Authorization');if(token==='Bearer a'||token==='Bearer b')req.accountUser={wallet_id:token.slice(-1)};next()});
 registerPurchasedPhotoApi(app,{store,policy});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const get=(path,wallet,options={})=>fetch(base+path,{...options,headers:{...(wallet?{Authorization:'Bearer '+wallet}:{}),...options.headers}});
 const image=await sharp({create:{width:60,height:80,channels:4,background:'#cbe7ff'}}).png().toBuffer();
 const upload=(wallet,ids=['job_a'],bytes=image)=>{const form=new FormData();form.append('jobIds',JSON.stringify(ids));form.append('image',new Blob([bytes],{type:'image/png'}),'photo.png');return get('/api/purchased-photos',wallet,{method:'POST',body:form})};
 let receipt;
 await check('authentication and paid ownership precede upload/storage',async()=>{
  assert.equal((await upload(null)).status,401);assert.equal((await upload('b')).status,403);
  assert.equal((await upload('a',['job_a','job_b'])).status,403);assert.equal((await upload('a',[])).status,400);assert.equal((await upload('a',['job_a'],Buffer.from('not an image'))).status,400);
  assert.equal((await get('/api/purchased-photos',null,{headers:{'X-Wallet-ID':'a'}})).status,401);
 });
 await check('paid PNG is stored with a cryptographic link and exact seven-day window',async()=>{
  const response=await upload('a');assert.equal(response.status,200);receipt=await response.json();
  assert.match(receipt.receiveUrl,/^\/receive\/[a-f0-9]{64}$/);assert.equal(receipt.packageId,'89');
  assert.equal(Date.parse(receipt.expiresAt)-Date.parse(receipt.purchasedAt),7*86400000);
  const saved=await get(receipt.imageUrl,'a');assert.equal(saved.status,200);
  assert.deepEqual(await sharp(Buffer.from(await saved.arrayBuffer())).raw().toBuffer(),await sharp(image).raw().toBuffer());
  const preview=await get(receipt.previewUrl,'a');assert.match(preview.headers.get('content-type'),/webp/);
 });
 await check('other accounts cannot list or fetch a purchased photo, even with forged wallet headers',async()=>{
  const r=await get('/api/purchased-photos','b',{headers:{'X-Wallet-ID':'a'}});assert.deepEqual((await r.json()).items,[]);
  assert.equal((await get(receipt.imageUrl,'b')).status,404);assert.equal((await get(receipt.imageUrl)).status,401);
 });
 await check('receive link works without login and supplies all three saving actions',async()=>{
  const r=await get(receipt.receiveUrl);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  const html=await r.text();for(const text of ['ดาวน์โหลดรูป','เปิดรูปเพื่อบันทึก','คัดลอกลิงก์รับรูป'])assert(html.includes(text));
  assert.equal((await get(receipt.receiveUrl+'/image')).status,200);
  assert.match((await get(receipt.receiveUrl+'/image?download=1')).headers.get('content-disposition'),/^attachment/);
  assert.equal((await get('/receive/'+ '0'.repeat(64))).status,404);
 });
 await check('repeated downloads retain the link and expiry; changed versions group by purchased work',async()=>{
  const same=await(await upload('a')).json();assert.equal(same.id,receipt.id);assert.equal(same.receiveUrl,receipt.receiveUrl);assert.equal(same.expiresAt,receipt.expiresAt);
  const other=await sharp(image).modulate({brightness:.9}).png().toBuffer();await upload('a',['job_a'],other);await upload('a',['job_c']);
  const items=(await(await get('/api/purchased-photos','a')).json()).items;assert.equal(items.length,2);assert(items.some(i=>i.packageId==='159'));
  assert.equal((await get(receipt.receiveUrl)).status,200);
 });
 await check('returning to an earlier size makes it the current history file without extending its link or expiry',async()=>{
  const restored=await(await upload('a')).json();assert.equal(restored.id,receipt.id);assert.equal(restored.expiresAt,receipt.expiresAt);
  const items=(await(await get('/api/purchased-photos','a')).json()).items;assert.equal(items.find(item=>item.jobIds.includes('job_a')).id,receipt.id);
  await db.query('ALTER TABLE purchased_photo_files DROP COLUMN updated_at');await createPurchasedPhotoStore(db).ready();
  const row=await store.byToken(receipt.receiveUrl.split('/').pop());assert.equal(new Date(row.expires_at).toISOString(),receipt.expiresAt);assert(row.image);assert(row.updated_at);
 });
 await check('refund/revocation blocks existing links immediately',async()=>{
  allowed.delete('a:job_a');assert.equal((await get(receipt.receiveUrl)).status,403);assert.equal((await get(receipt.imageUrl,'a')).status,403);allowed.add('a:job_a');
 });
 await check('expired files cannot be fetched or renewed and cleanup removes stored bytes',async()=>{
  await db.query("UPDATE paid_image_unlocks SET created_at=clock_timestamp()-interval '8 days' WHERE job_id='job_a'");
  await db.query("UPDATE purchased_photo_files SET purchased_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day' WHERE work_scope='work_job_a'");
  assert.equal((await get(receipt.receiveUrl)).status,410);assert.equal((await get(receipt.imageUrl,'a')).status,410);assert.equal((await upload('a')).status,410);
  assert.equal((await(await get('/api/purchased-photos','a')).json()).items.length,1);
  assert.equal(await store.purge(),2);const row=await store.byToken(receipt.receiveUrl.split('/').pop());assert.equal(row.image,null);assert.equal(row.preview,null);
 });
 console.log(`${passed} purchased-photo storage/API scenarios passed; local fixtures only.`);
}finally{if(server)await new Promise(resolve=>server.close(resolve));await db.query(`DROP SCHEMA ${schema} CASCADE`);await db.end()}
