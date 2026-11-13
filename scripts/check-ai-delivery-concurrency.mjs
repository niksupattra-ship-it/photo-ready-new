// Real, disposable PostgreSQL. No production DATABASE_URL, API key or account.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from 'pg';
const exec=promisify(execFile),env={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=async(...args)=>(await exec('docker',['--host=unix:///var/run/docker.sock',...args],{env,timeout:30000,maxBuffer:1024*1024})).stdout.trim();
const name='idprom-ai-delivery-'+crypto.randomBytes(5).toString('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
let pool,started=false;
try{
 await docker('image','inspect','postgres:16-alpine','--format','{{.Id}}');
 await docker('run','--pull=never','--rm','-d','--name',name,'--tmpfs','/var/lib/postgresql/data:rw,size=128m','-e','POSTGRES_HOST_AUTH_METHOD=trust','-p','127.0.0.1::5432','postgres:16-alpine');started=true;
 const port=Number((await docker('port',name,'5432/tcp')).match(/^127\.0\.0\.1:(\d+)$/m)?.[1]);assert(port);
 for(let attempt=0;;attempt++){try{await docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres');break}catch(error){if(attempt>=79)throw error;await new Promise(r=>setTimeout(r,100))}}
 pool=new pg.Pool({host:'127.0.0.1',port,user:'postgres',database:'postgres',max:4,connectionTimeoutMillis:2000,statement_timeout:3000,options:'-c deadlock_timeout=100ms'});
 await pool.query(`CREATE TABLE wallets(id text PRIMARY KEY,usd_premium_remaining int NOT NULL,usd_premium_cycle text,usd_premium_expires_at timestamptz);
 CREATE TABLE credit_usage(id text PRIMARY KEY,wallet_id text REFERENCES wallets(id),status text,credit_column text,usd_premium_cycle text,completed_at timestamptz);
 CREATE TABLE paid_image_unlocks(wallet_id text REFERENCES wallets(id),job_id text,full_edit boolean,created_at timestamptz,PRIMARY KEY(wallet_id,job_id));
 CREATE TABLE premium_hair_unlocks(wallet_id text REFERENCES wallets(id),job_id text,PRIMARY KEY(wallet_id,job_id));`);
 const jobLocked=deferred(),walletLocked=deferred(),resumeConfirm=deferred();let clients=0;
 const fixturePool={query:(...args)=>pool.query(...args),async connect(){const client=await pool.connect(),role=++clients===1?'confirm':'cancel';return{release:()=>client.release(),async query(sql,...args){const result=await client.query(sql,...args);if(role==='confirm'&&sql.startsWith('SELECT * FROM ai_jobs')){jobLocked.resolve();await resumeConfirm.promise}if(role==='cancel'&&sql.startsWith('SELECT id FROM wallets'))walletLocked.resolve();return result}}}};
 const raw=await readFile(new URL('../job-store.js',import.meta.url),'utf8');
 const store=Function('crypto','pg','process',raw.replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nreturn {ready,settleAiJobDelivery};')(crypto,{Pool:class{constructor(){return fixturePool}}},{env:{DATABASE_URL:'postgres://localhost/disposable',PGSSLMODE:'disable'}});
 await store.ready();
 await pool.query("INSERT INTO wallets VALUES('wallet',19,'cycle',now()+interval '1 day'); INSERT INTO credit_usage(id,wallet_id,status,credit_column,usd_premium_cycle) VALUES('usage','wallet','reserved','usd_premium_remaining','cycle'); INSERT INTO ai_jobs(id,wallet_id,usage_id,status,fields,image,result) VALUES('job','wallet','usage','completed','{\"delivery_pending\":true}','input','output')");
 const confirm=store.settleAiJobDelivery('job','wallet','confirm');confirm.catch(()=>{});
 await jobLocked.promise;
 const cancel=store.settleAiJobDelivery('job','wallet','cancel');cancel.catch(()=>{});
 await Promise.race([walletLocked.promise,new Promise(r=>setTimeout(r,125))]);resumeConfirm.resolve();
 const outcomes=await Promise.allSettled([confirm,cancel]);
 assert(outcomes.every(o=>o.status==='fulfilled'),'confirmation and cancellation must not deadlock: '+outcomes.map(o=>o.status==='rejected'?o.reason.code:JSON.stringify(o.value)).join(', '));
 assert.equal(outcomes[0].value.status,200);assert.equal(outcomes[1].value.status,409);
 const wallet=(await pool.query("SELECT usd_premium_remaining FROM wallets WHERE id='wallet'")).rows[0];assert.equal(wallet.usd_premium_remaining,19);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM paid_image_unlocks')).rows[0].n,1);
 assert.equal((await store.settleAiJobDelivery('job','wallet','confirm')).status,200);
 console.log(JSON.stringify({passed:true,engine:'PostgreSQL16',checks:['actual job-store delivery SQL','USD foreign-key lock race','one committed credit and unlock','cancel cannot refund delivered work','idempotent confirmation']}));
}finally{if(pool)await pool.end();if(started)await docker('rm','-f',name).catch(()=>{})}
