// Actual store SQL on a disposable PostgreSQL WASM database. No production
// connection, payment, provider request or customer file is used.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createPurchasedPhotoStore} from '../purchased-photo-store.js';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),queries=[],cases=[];
const pool={query:async(sql,args)=>{queries.push(sql);const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows??r.rows.length}}};
const check=async(name,run)=>{await run();cases.push(name);console.log('PASS '+name)};
const bytes=value=>value===null||value===undefined?0:value instanceof Uint8Array?value.byteLength:typeof value==='string'?Buffer.byteLength(value):value instanceof Date?24:typeof value==='object'?Object.entries(value).reduce((n,[k,v])=>n+Buffer.byteLength(k)+bytes(v),0):8;
try{
 await db.query('CREATE TABLE paid_image_unlocks(wallet_id text,job_id text,created_at timestamptz DEFAULT clock_timestamp())');
 await db.query("INSERT INTO paid_image_unlocks(wallet_id,job_id) VALUES('owner','job-owned')");
 const store=createPurchasedPhotoStore(pool),image=crypto.randomBytes(2*1024*1024),preview=crypto.randomBytes(16*1024);
 const archive=await store.put({walletId:'owner',scope:'dwork_'+'a'.repeat(36),jobIds:['job-owned'],packageId:'159',image,preview,width:900,height:1200});
 const project={format:'idprom-studio',version:1,width:900,height:1200,layers:[{kind:'head',jobId:'job-owned',source:'data:image/png;base64,'+crypto.randomBytes(3*1024*1024).toString('base64')}],manualEditFixture:{x:123,y:81,scale:1.1}};
 await store.storeEditor('owner',archive.id,project);
 const full=await store.owned('owner',archive.id),small=await store.ownedAsset('owner',archive.id,'preview'),download=await store.ownedAsset('owner',archive.id,'image'),access=await store.ownedAccess('owner',archive.id);
 await check('preview projection reads exact preview bytes without delivery or project payloads',async()=>{
  assert.deepEqual(Buffer.from(small.preview),preview);assert.equal(small.image,undefined);assert.equal(small.editor_project,undefined);assert.equal(small.has_image,true);assert.equal(small.expired,false);
 });
 await check('download projection preserves exact full-resolution file without preview or editor payloads',async()=>{
  assert.deepEqual(Buffer.from(download.image),image);assert.equal(download.preview,undefined);assert.equal(download.editor_project,undefined);assert.equal(download.has_image,true);
 });
 await check('access projection contains fresh file status and metadata without any stored blob or project',async()=>{
  assert.equal(access.image,undefined);assert.equal(access.preview,undefined);assert.equal(access.editor_project,undefined);assert.equal(access.has_image,true);assert.equal(access.work_scope,archive.work_scope);assert.deepEqual(access.job_ids,['job-owned']);assert.equal(access.package_id,'159');
 });
 await check('editor snapshot read keeps all exact manual data while excluding delivery and preview bytes',async()=>{
  const editor=await store.ownedEditor('owner',archive.id);assert.deepEqual(editor.editor_project,project);assert.equal(editor.image,undefined);assert.equal(editor.preview,undefined);
 });
 await check('all narrow projections preserve owner isolation and reject invalid asset identifiers',async()=>{
  for(const read of [()=>store.ownedAsset('foreign',archive.id,'image'),()=>store.ownedAsset('foreign',archive.id,'preview'),()=>store.ownedAccess('foreign',archive.id)])assert.equal(await read(),null);
  await assert.rejects(()=>store.ownedAsset('owner',archive.id,'editor_project'),e=>e.status===400);
 });
 await check('reads never modify purchase expiry, source, package or manual snapshot',async()=>{
  const after=await store.owned('owner',archive.id);for(const key of ['id','work_scope','job_ids','package_id','purchased_at','expires_at','editor_project'])assert.deepEqual(after[key],full[key]);
 });
 await check('expired and purged state remain fresh on all projections',async()=>{
  await db.query("UPDATE purchased_photo_files SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[archive.id]);
  assert.equal((await store.ownedAccess('owner',archive.id)).expired,true);assert.equal((await store.ownedAsset('owner',archive.id,'preview')).expired,true);await store.purge();
  const gone=await store.ownedAccess('owner',archive.id);assert.equal(gone.has_image,false);assert.equal(gone.expired,true);assert.equal((await store.ownedAsset('owner',archive.id,'preview')).preview,null);
 });
 const fullBytes=bytes(full),previewBytes=bytes(small),accessBytes=bytes(access),imageBytes=bytes(download);
 assert(previewBytes<fullBytes/100,'Thumbnail reads must remove at least 99% of unrelated fixture bytes');assert(accessBytes<4096,'Access reads must stay metadata-sized');
 console.log(JSON.stringify({passed:cases.length,fixtureBytes:{fullRead:fullBytes,previewRead:previewBytes,accessRead:accessBytes,imageRead:imageBytes},previewReductionPercent:Number((100*(1-previewBytes/fullBytes)).toFixed(2)),scope:'actual purchased-photo store SQL in isolated PGlite; payload counts describe this fixture, not production timing'}));
}finally{await db.close()}
