// Built-interface audit with locally intercepted assets; no external service requests.
// Local DOM-only Chromium checks. No application, AI, payment or email endpoint is called.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

await mkdir('work',{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'idprom-english-dom-'));
const browser=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let buffer='',seq=0;const pending=new Map();browser.stderr.on('data',()=>{});
browser.stdio[4].on('data',data=>{buffer+=data.toString();let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const result=JSON.parse(raw);if(result.method)handleEvent(result);const p=pending.get(result.id);if(!p)continue;pending.delete(result.id);clearTimeout(p.timer);result.error?p.reject(Error(JSON.stringify(result.error))):p.resolve(result.result)}});
const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser timeout: '+method))},15000);pending.set(id,{resolve,reject,timer});browser.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')});
const origin='https://idprom-preview.invalid';let activeSession;const errors=[],blocked=[];
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'};
async function handleEvent(event){
 if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.text+': '+(event.params.exceptionDetails.exception?.description||''));
 if(event.method!=='Fetch.requestPaused')return;
 const {requestId,request}=event.params;const url=new URL(request.url);let status=200,body,mime='text/plain';
 try{
  if(url.origin!==origin){status=204;body=Buffer.from('')}
  else if(url.pathname.startsWith('/api/')){
   mime='application/json';if(request.method!=='GET'){status=503;blocked.push(url.pathname);body=Buffer.from(JSON.stringify({message:'Requests are disabled for this local interface audit.'}))}
   else body=Buffer.from(JSON.stringify({ok:true,items:[],balance:0,downloadRemaining:0,generationRemaining:0,premiumDownloadRemaining:0,hairRemaining:0,trialRemaining:2,trialAvailable:true,revision:'1234567890abcdef12345678'}));
  }else{
   let file=path.resolve('dist','.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve('dist')+'/'))file=path.resolve('dist/index.html');
   try{body=await readFile(file)}catch{file=path.resolve('dist/index.html');body=await readFile(file)}mime=types[path.extname(file)]||'application/octet-stream';
  }
  await call('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:mime}],body:body.toString('base64')},event.sessionId||activeSession);
 }catch(e){errors.push('Fixture: '+e.message)}
}
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},activeSession);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
const scan=()=>evaluate(`(()=>{const result=[],walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode,p=n.parentElement;if(!p||p.closest('script,style,code,pre,input,textarea,[contenteditable],[data-no-translate]')||!p.getClientRects().length)continue;if(/[\\u0E00-\\u0E7F]/.test(n.nodeValue))result.push(n.nodeValue.trim())}return [...new Set(result)]})()`);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await call('Browser.getVersion');const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});activeSession=sessionId;
 await call('Runtime.enable',{},sessionId);await call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Page.navigate',{url:origin+'/?lang=en'},sessionId);await pause(2000);
 const report={home:await scan()};
 const choiceImages=await evaluate(`Array.from(document.querySelectorAll('.studio-category-card>img,.studio-featured-item img')).map(img=>img.getAttribute('src'))`);
 assert(choiceImages.length>0);assert(choiceImages.every(src=>src.includes('/uniform-quick-previews/job-uniforms--')),'Home outfit choices must show patterns only');
 await evaluate(`document.querySelector('.idprom-support-trigger')?.click()`);await pause(150);assert(await evaluate(`Boolean(document.querySelector('.idprom-support-dialog[open]'))`),'Help dialog did not open');report.help=await scan();await evaluate(`document.querySelector('.idprom-support-dialog header button')?.click()`);
 await evaluate(`document.querySelector('.idprom-terms-link')?.click()`);await pause(150);assert(await evaluate(`Boolean(document.querySelector('.idprom-terms-dialog[open]'))`),'Terms dialog did not open');report.terms=await scan();await evaluate(`document.querySelector('.idprom-terms-dialog header button')?.click()`);
 await evaluate(`document.querySelector('.idprom-member-menu > button')?.click()`);await pause(150);report.account=await scan();
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Sign in /'))?.click()`);await pause(150);assert(await evaluate(`Boolean(document.querySelector('input[type="email"]'))`),'Sign-in form did not open');report.signIn=await scan();
 const screenshot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('work/english-interface-desktop.png',Buffer.from(screenshot.data,'base64'));
 await call('Page.navigate',{url:origin+'/?lang=en'},sessionId);await pause(1000);await evaluate(`document.querySelector('.easy-studio')?.click()`);await pause(1500);report.studio=await scan();await evaluate(`Array.from(document.querySelectorAll('.studio-bottom-choices button')).find(button=>button.textContent.trim()==='Outfit')?.click()`);await pause(150);
 const studioChoices=await evaluate(`Array.from(document.querySelectorAll('.studio-catalog-grid button:not(.studio-none-choice) img')).map(img=>img.getAttribute('src'))`);assert(studioChoices.length>0);assert(studioChoices.every(src=>src.includes('/uniform-quick-previews/job-uniforms--')),'Studio outfit choices must show patterns only: '+JSON.stringify(studioChoices));
 await evaluate(`document.querySelector('.studio-photo-guide-trigger')?.click()`);await pause(100);report.photoGuide=await scan();assert(await evaluate(`Boolean(document.querySelector('.english-photo-guide'))`),'English photo guide did not open');await evaluate(`document.querySelector('.studio-photo-guide-close')?.click()`);
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);await pause(250);report.mobile=await scan();
 const mobile=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('work/english-interface-mobile.png',Buffer.from(mobile.data,'base64'));
 for(const [screen,copy]of Object.entries(report))assert.equal(copy.length,0,screen+': '+JSON.stringify(copy));assert.equal(errors.length,0,JSON.stringify(errors));await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Page.navigate',{url:origin+'/'},sessionId);await pause(1200);
 const patternOnly=src=>!src.includes('example')&&!src.includes('/home-previews/')&&/^\/assets\/(?:uniform-quick-previews|(?:job|government|student|gown)-uniforms)\//.test(src);
 const thaiCategories=await evaluate(`Array.from(document.querySelectorAll('.studio-category-card>img')).map(img=>img.getAttribute('src'))`);assert.equal(thaiCategories.length,4);assert(thaiCategories.every(patternOnly),'Thai category cards must show garment patterns');
 await evaluate(`document.querySelector('.studio-category-government')?.click()`);await pause(100);
 const thaiGovernment=await evaluate(`Array.from(document.querySelectorAll('.studio-home-results .government-level-grid img')).map(img=>img.getAttribute('src'))`);assert(thaiGovernment.length>0);assert(thaiGovernment.every(patternOnly),'Thai government options must show garment patterns');
 await evaluate(`document.querySelector('.studio-category-gown')?.click()`);await pause(100);
 const thaiGowns=await evaluate(`Array.from(document.querySelectorAll('.studio-home-results .government-level-grid img')).map(img=>img.getAttribute('src'))`);assert(thaiGowns.length>0);assert(thaiGowns.every(patternOnly),'Thai gown options must show garment patterns');
 await evaluate(`document.querySelector('.easy-studio')?.click()`);await pause(1400);await evaluate(`Array.from(document.querySelectorAll('.studio-bottom-choices button')).find(button=>button.textContent.trim()==='ชุด')?.click()`);await pause(150);
 const thaiStudio=await evaluate(`Array.from(document.querySelectorAll('.studio-catalog-grid button:not(.studio-none-choice) img')).map(img=>img.getAttribute('src'))`);assert.equal(thaiStudio.length,36);assert(thaiStudio.every(patternOnly),'All Thai Studio options must show garment patterns');
 const thaiScreenshot=await call('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('work/thai-outfit-patterns.png',Buffer.from(thaiScreenshot.data,'base64'));
 report.thaiOutfitPatterns='PASS: 4 categories, government and gown selectors, and all 36 Studio outfits';
 report.runtimeErrors=errors;report.blockedWrites=blocked;await writeFile('work/english-interface-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{for(const p of pending.values())clearTimeout(p.timer);browser.kill('SIGTERM');await new Promise(r=>browser.once('exit',r));await rm(profile,{recursive:true,force:true}).catch(()=>{})}
