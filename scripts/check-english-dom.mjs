// Local DOM-only Chromium checks. No application, AI, payment or email endpoint is called.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ENGLISH_ADDITIONAL_COPY} from '../src/english-copy-additions.js';
const profile=await mkdtemp(path.join(tmpdir(),'idprom-english-dom-'));
const browser=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let buffer='',seq=0;const pending=new Map();browser.stderr.on('data',()=>{});
browser.stdio[4].on('data',data=>{buffer+=data.toString();let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const result=JSON.parse(raw),p=pending.get(result.id);if(!p)continue;pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result)}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser timeout: '+method))},15000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')});
try{
 await call('Browser.getVersion');const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 const source=(await readFile(new URL('../src/english-preview.js',import.meta.url),'utf8')).replace(/^import .*\n/,'').replace(/\bexport /g,'');
 const expression=`(async()=>{
 const ENGLISH_ADDITIONAL_COPY=${JSON.stringify(ENGLISH_ADDITIONAL_COPY)};
 ${source}
 const check=(condition,label)=>{if(!condition)throw Error(label)};const checks=[];
 document.body.innerHTML='<button id="upload" aria-label="อัปโหลดรูป">อัปโหลดรูป</button><input id="email" placeholder="อีเมล" value="customer@example.com"><textarea>บันทึกของผู้ใช้</textarea><div contenteditable>ข้อความของผู้ใช้</div><p data-no-translate>ชื่อลูกค้า</p><div id="dynamic"></div>';
 const originalButton=document.querySelector('#upload');let clicks=0;originalButton.onclick=()=>clicks++;
 let confirmed;const view={location:{search:'?lang=en'},MutationObserver,confirm:message=>{confirmed=message;return true},alert(){},prompt(){return 'unchanged'}};
 const doc={body:document.body,documentElement:document.documentElement,querySelector:document.querySelector.bind(document),defaultView:view,title:''};
 const nativeConfirm=view.confirm;const stop=startEnglishPreview(doc);
 check(originalButton.textContent==='Upload photo','button translation');checks.push('initial text');
 check(originalButton.getAttribute('aria-label')==='Upload photo','accessible label');checks.push('accessible labels');
 check(document.querySelector('input').placeholder==='Email','input placeholder');check(document.querySelector('input').value==='customer@example.com','form value');check(document.querySelector('textarea').value==='บันทึกของผู้ใช้','textarea');check(document.querySelector('[contenteditable]').textContent==='ข้อความของผู้ใช้','editable content');check(document.querySelector('[data-no-translate]').textContent==='ชื่อลูกค้า','excluded data');checks.push('user content preserved');
 originalButton.click();check(clicks===1,'existing event handler');checks.push('event handlers preserved');
 const host=document.createElement('div'),shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<button title="บันทึกไฟล์">บันทึกรูปของคุณ</button><p id="status"></p>';document.body.append(host);
 const status=document.createElement('p');status.textContent='กำลังตรวจสอบเครดิต…';document.querySelector('#dynamic').append(status);
 await new Promise(r=>setTimeout(r,50));
 check(shadow.querySelector('button').textContent==='Save your photo','shadow text');check(shadow.querySelector('button').title==='Save file','shadow attributes');check(status.textContent==='Checking your credits…','dynamic status');checks.push('dynamic content and shadow roots');
 shadow.querySelector('#status').textContent='ส่งคำขอบันทึกไฟล์แล้ว กรุณาตรวจในรายการดาวน์โหลด';await new Promise(r=>setTimeout(r,50));check(!/[\\u0E00-\\u0E7F]/.test(shadow.querySelector('#status').textContent),'shadow update');checks.push('asynchronous shadow updates');
 check(view.confirm('ยืนยันลบ')===true&&confirmed==='Confirm deletion','native confirmation');checks.push('native dialogs');
 const samples=document.createElement('div');for(const thai of Object.keys(ENGLISH_COPY)){const label=document.createElement('span');label.textContent=thai;samples.append(label)}document.body.append(samples);await new Promise(r=>setTimeout(r,80));for(const label of samples.children)check(!/[\\u0E00-\\u0E7F]/.test(label.textContent),'untranslated dictionary entry: '+label.textContent);checks.push(samples.children.length+' reviewed labels');
 stop();check(view.confirm===nativeConfirm,'native cleanup');
 return checks;
})()`;
 const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
 assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));assert(Array.isArray(result.result?.value));console.log('PASS real Chromium DOM: '+result.result.value.join('; ')+'. No external requests.');
}finally{for(const p of pending.values())clearTimeout(p.timer);browser.kill('SIGTERM');await new Promise(r=>browser.once('exit',r));await rm(profile,{recursive:true,force:true}).catch(()=>{})}
