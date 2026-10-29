// Local observational-client failure tests. No provider, payment or live account.
import assert from 'node:assert/strict';
import {createDownloadAuditClient,configureDownloadAudit,beginDownloadAudit,refreshDownloadAuditSession} from '../src/download-audit.js';
import {deliverImage,dismissFileSavePanel} from '../src/image-download.js';
const checks=[];
const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name)};
const turns=async()=>{for(let n=0;n<15;n++)await Promise.resolve()};
function memoryStorage(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key),map}}
function fixture(options={}){
 let time=Date.UTC(2026,9,29),timerId=0;const timers=new Map(),calls=[],listeners=new Map(),storage=options.storage||memoryStorage(),navigator={onLine:true,userAgent:'Mozilla Chrome/120 Safari/537.36',...options.navigator};
 const state={session:{token:'fixture-token-a',walletId:'wallet-a'},enabled:true,...options.state};
 const fetch=options.fetch||(async(url,request)=>{calls.push({url,request,body:JSON.parse(request.body)});return {ok:true,status:200,json:async()=>({ok:true,accepted:JSON.parse(request.body).events.map(e=>e.eventId)})}});
 const client=createDownloadAuditClient({session:()=>state.session,enabled:()=>state.enabled},{storage,navigator,now:()=>time,fetch,
  target:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}},
  setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:time+delay});return id},clearTimeout:id=>timers.delete(id)});
 const advance=async(ms)=>{time+=ms;for(let n=0;n<100;n++){const due=[...timers].filter(([,row])=>row.at<=time);if(!due.length)break;for(const [id,row]of due){if(timers.delete(id))row.fn()}await turns()}};
 return {client,state,calls,storage,navigator,listeners,advance,get time(){return time},setTime:value=>{time=value},begin:extra=>client.begin({jobIds:['job-b','job-a','job-a'],mode:'studio',initiator:'user',...extra}),queued:()=>JSON.parse(storage.getItem('idprom_download_audit_v1')||'[]')};
}
await check('begin creates no invented user click and emit sends only bounded metadata under current authentication',async()=>{
 const f=fixture(),a=f.begin();assert.equal(f.calls.length,0);assert.equal(f.queued().length,0);
 a.emit('file_prepared',{sizeId:'original',fileType:'image/png',byteSize:123,email:'secret@example.com',token:'secret',fileName:'private.png',errorMessage:'secret'});
 assert.equal(f.calls.length,0,'emit never awaits or invokes network synchronously');await f.client.flush();
 assert.equal(f.calls.length,1);const {body,request,url}=f.calls[0];assert.equal(url,'/api/download-events');assert.equal(request.headers.Authorization,'Bearer fixture-token-a');assert.equal(request.keepalive,true);assert.equal(body.expectedWalletId,'wallet-a');assert.deepEqual(body.jobIds,['job-a','job-b']);assert.equal(body.browserFamily,'chrome');assert.equal(body.deviceClass,'desktop');assert.equal(body.events[0].type,'file_prepared');assert.equal(body.events[0].byteSize,123);assert(!JSON.stringify(body).includes('secret'));assert.equal(f.queued().length,0);f.client.stop();
});
await check('guest disabled invalid context and unknown event types are harmless no-ops',async()=>{
 for(const kind of ['guest','disabled','context','event']){const f=fixture();if(kind==='guest')f.state.session={};if(kind==='disabled')f.state.enabled=false;const a=f.begin(kind==='context'?{mode:'untrusted'}:{});a.emit(kind==='event'?'saved_on_device':'download_clicked');await f.client.flush();assert.equal(f.calls.length,0,kind);assert.equal(f.queued().length,0,kind);f.client.stop()}
});
await check('error strings are typed and raw arbitrary error text cannot enter storage',async()=>{
 const f=fixture(),a=f.begin();a.emit('download_failed',{errorStage:'contact@private.example',errorCode:'password-secret',errorMessage:'private-token'});const text=JSON.stringify(f.queued());assert(!text.includes('private'));assert.equal(f.queued()[0].event.errorStage,'unknown');assert.equal(f.queued()[0].event.errorCode,'unknown');await f.client.flush();f.client.stop();
});
await check('storage quota or denied storage never blocks in-memory delivery observations',async()=>{
 const storage={getItem(){throw Error('denied')},setItem(){throw Error('quota')},removeItem(){throw Error('denied')}};const f=fixture({storage}),a=f.begin();assert.doesNotThrow(()=>a.emit('download_requested',{method:'desktop_anchor'}));await f.client.flush();assert.equal(f.calls.length,1);f.client.stop();
});
await check('network throws retry at most six times without any shared auth/UI callback',async()=>{
 let count=0;const f=fixture({fetch:()=>{count++;throw Error('fixture network')}}),a=f.begin();a.emit('download_clicked');for(let n=0;n<10;n++)await f.client.flush();assert.equal(count,6);assert.equal(f.queued()[0].tries,6);f.client.stop();
});
await check('a fresh attempt flushes immediately while an older failed attempt is backing off',async()=>{
 const attempts=[];let first=true;const f=fixture({fetch:async(_url,request)=>{const body=JSON.parse(request.body);attempts.push(body.attemptId);if(first){first=false;return {ok:false,status:503}}return {ok:true,status:200,json:async()=>({accepted:body.events.map(e=>e.eventId)})}}});
 const old=f.begin();old.emit('download_clicked');await f.advance(0);assert.equal(attempts.length,1);assert.equal(f.queued()[0].nextAt,f.time+2000);
 f.begin({jobIds:['job-new']}).emit('download_clicked');await f.advance(0);assert.equal(attempts.length,2);assert.notEqual(attempts[0],attempts[1]);assert.equal(f.queued().length,1);assert.equal(f.queued()[0].batch.attemptId,attempts[0]);f.client.stop();
});
await check('offline queue survives reload without persisting token and replays only current wallet',async()=>{
 const f=fixture();f.navigator.onLine=false;f.begin().emit('download_clicked');await f.client.flush();assert.equal(f.calls.length,0);assert(!JSON.stringify(f.queued()).includes('fixture-token'));const eventId=f.queued()[0].event.eventId;f.client.stop();
 const other=fixture({storage:f.storage,state:{session:{token:'fixture-token-b',walletId:'wallet-b'}}});await other.client.flush();assert.equal(other.calls.length,0);other.state.session={token:'rotated-token-a',walletId:'wallet-a'};other.client.refresh();await other.client.flush();assert.equal(other.calls.length,1);assert.equal(other.calls[0].body.events[0].eventId,eventId);assert.equal(other.calls[0].request.headers.Authorization,'Bearer rotated-token-a');other.client.stop();
});
await check('401 pauses only audit traffic until same-wallet token rotates, never logs user out',async()=>{
 let calls=0,token='';const f=fixture({fetch:async(_url,request)=>{calls++;token=request.headers.Authorization;return calls===1?{ok:false,status:401}:{ok:true,status:200,json:async()=>({accepted:JSON.parse(request.body).events.map(e=>e.eventId)})}}});f.begin().emit('download_clicked');await f.client.flush();await f.client.flush();assert.equal(calls,1);assert.equal(f.state.session.token,'fixture-token-a');f.state.session.token='rotated';f.client.refresh();await f.client.flush();assert.equal(calls,2);assert.equal(token,'Bearer rotated');assert.equal(f.queued().length,0);f.client.stop();
});
await check('stale callbacks are fenced after account switch and after explicit logout refresh',async()=>{
 const f=fixture(),a=f.begin();a.emit('download_clicked');f.state.session={token:'fixture-b',walletId:'wallet-b'};f.client.refresh();a.emit('file_prepared');const b=f.begin();b.emit('download_clicked');await f.client.flush();assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.expectedWalletId,'wallet-b');assert.equal(f.queued().length,1);
 f.state.session={token:'relogin-a',walletId:'wallet-a'};f.client.refresh();a.emit('file_prepared');assert.equal(f.queued().length,1);await f.client.flush();assert.equal(f.calls.length,2);const c=f.begin();f.state.session={};f.client.refresh();f.state.session={token:'relogin-again',walletId:'wallet-a'};f.client.refresh();c.emit('file_prepared');assert.equal(f.queued().length,0);f.client.stop();
});
await check('in-flight account change cannot acknowledge or emit events for a replacement wallet',async()=>{
 let release;const requests=[];const f=fixture({fetch:async(_url,request)=>{requests.push(JSON.parse(request.body));return new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>({accepted:JSON.parse(request.body).events.map(e=>e.eventId)})})})}});const a=f.begin();a.emit('download_clicked');const running=f.client.flush();await turns();f.state.session={token:'token-b',walletId:'wallet-b'};f.client.refresh();a.emit('download_requested');f.begin().emit('download_clicked');release();await running;assert.equal(f.queued().length,2);assert.equal(requests.length,1);assert.equal(requests[0].expectedWalletId,'wallet-a');f.client.stop();
});
await check('stopped client completion cannot erase a queued event or revive stale callbacks',async()=>{
 let release;const f=fixture({fetch:async(_url,request)=>new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>({accepted:JSON.parse(request.body).events.map(e=>e.eventId)})})})});const a=f.begin();a.emit('download_clicked');const request=f.client.flush();await turns();const id=f.queued()[0].event.eventId;f.client.stop();a.emit('file_prepared');release();await request;assert.equal(f.queued().length,1);assert.equal(f.queued()[0].event.eventId,id);
 const retry=fixture({storage:f.storage});await retry.client.flush();assert.equal(retry.calls.length,1);assert.equal(retry.calls[0].body.events[0].eventId,id);retry.client.stop();
});
await check('queue is capped at one hundred events and prunes records older than forty-eight hours',async()=>{
 const f=fixture();f.navigator.onLine=false;const a=f.begin();for(let n=0;n<110;n++)a.emit('download_clicked');assert.equal(f.queued().length,100);assert.equal(new Set(f.queued().map(e=>e.event.eventId)).size,100);f.setTime(f.time+48*60*60*1000+1);f.begin().emit('download_clicked');assert.equal(f.queued().length,1);f.client.stop();
});
await check('malformed and oversized storage is discarded instead of submitted',async()=>{
 for(const input of ['{"token":"secret"}',JSON.stringify([{queuedAt:Date.UTC(2026,9,29),tries:0,nextAt:0,batch:{expectedWalletId:'wallet-a'},event:{type:'saved_on_device'}}]),'x'.repeat(2*1024*1024+1)]){const storage=memoryStorage();storage.setItem('idprom_download_audit_v1',input);const f=fixture({storage});await f.client.flush();assert.equal(f.calls.length,0);f.client.stop()}
});
await check('permanent invalid cross-account conflicts are not retried while 429 and 503 are bounded',async()=>{
 for(const status of [400,403,404,409,429,503]){let calls=0;const f=fixture({fetch:async()=>{calls++;return {ok:false,status}}});f.begin().emit('download_clicked');for(let n=0;n<8;n++)await f.client.flush();assert.equal(calls,status===429||status===503?6:1,String(status));f.client.stop()}
});
await check('stalled fetch and stalled response body time out without losing the queued event',async()=>{
 for(const phase of ['fetch','body']){const f=fixture({fetch:()=>phase==='fetch'?new Promise(()=>{}):Promise.resolve({ok:true,status:200,json:()=>new Promise(()=>{})})});f.begin().emit('download_clicked');const promise=f.client.flush();await turns();await f.advance(3001);await promise;assert.equal(f.queued().length,1);assert.equal(f.queued()[0].tries,1);f.client.stop()}
});
await check('partial acknowledgement preserves exact unacknowledged IDs for idempotent replay',async()=>{
 const requests=[];const f=fixture({fetch:async(_url,request)=>{const body=JSON.parse(request.body);requests.push(body);return {ok:true,status:200,json:async()=>({accepted:requests.length===1?[body.events[0].eventId,'unknown-event']:body.events.map(e=>e.eventId)})}}});const a=f.begin();a.emit('download_clicked');a.emit('file_prepared');await f.client.flush();assert.equal(f.queued().length,1);const event=f.queued()[0].event.eventId;await f.client.flush();assert.equal(requests[1].events[0].eventId,event);assert.equal(requests[0].attemptId,requests[1].attemptId);assert.equal(f.queued().length,0);f.client.stop();
});
await check('disabled endpoint acknowledges without retry and runtime disable keeps existing delivery independent',async()=>{
 let count=0;const f=fixture({fetch:async()=>{count++;return {ok:true,status:204}}});const a=f.begin();a.emit('download_clicked');f.state.enabled=false;a.emit('file_prepared');await f.client.flush();assert.equal(count,0);assert.equal(f.queued().length,1);f.state.enabled=true;await f.client.flush();assert.equal(count,1);assert.equal(f.queued().length,0);f.client.stop();
});
await check('public wrappers remain no-throw before config, on session failure and after cleanup',async()=>{
 assert.doesNotThrow(()=>beginDownloadAudit({}).emit('download_clicked'));const stop=configureDownloadAudit({session:()=>{throw Error('session unavailable')}});assert.doesNotThrow(()=>beginDownloadAudit({}).delivery('file_prepared'));assert.doesNotThrow(refreshDownloadAuditSession);assert.doesNotThrow(stop);assert.doesNotThrow(()=>beginDownloadAudit({}).emit('download_clicked'));
});

// A deliberately small DOM boundary exercises the real delivery helper. Real
// Chromium/WebKit integration tests separately cover its rendered mobile panel.
function deliveryFixture({mobile=false,observer=()=>{},shareResult='ok',type='image/png'}={}){
 const events=[],anchors=[],hosts=[],timers=[],nodes=new Map(),documentBefore=globalThis.document,windowBefore=globalThis.window,navigatorBefore=Object.getOwnPropertyDescriptor(globalThis,'navigator'),fileBefore=globalThis.File;
 const createNode=(name='')=>({name,hidden:false,style:{},listeners:new Map(),setAttribute(){},removeAttribute(){},focus(){},remove(){this.removed=true},addEventListener(type,fn){this.listeners.set(type,fn)},click(){events.push('click:'+name);this.listeners.get('click')?.({target:this,currentTarget:this})}});
 const root={innerHTML:'',activeElement:null,querySelector(selector){if(!nodes.has(selector))nodes.set(selector,createNode(selector));return nodes.get(selector)},addEventListener(){}};
 globalThis.window={matchMedia:()=>({matches:mobile})};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:mobile?'Mozilla iPhone AppleWebKit/605.1 Safari/605.1':'Mozilla Chrome/120',maxTouchPoints:mobile?1:0,canShare:()=>true,share:()=>{events.push('native_share');if(shareResult==='throw')throw Error('private message');if(shareResult==='cancel')return Promise.reject(Object.assign(Error('private message'),{name:'AbortError'}));return Promise.resolve()}}});
 globalThis.File=class{constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type}};
 globalThis.document={activeElement:{focus(){}},createElement:name=>{const node=createNode(name);if(name==='div'){node.attachShadow=()=>root;hosts.push(node)}else if(name==='a')anchors.push(node);return node},body:{appendChild:node=>events.push('append:'+node.name)}};
 const oldSetTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length};
 return {nodes,events,anchors,hosts,run:()=>deliverImage(new Blob(['fixture-image'],{type}),'fixture.png',{onEvent:(...args)=>{events.push('audit:'+args[0]);return observer(...args)}}),restore(){dismissFileSavePanel();globalThis.setTimeout=oldSetTimeout;for(const timer of timers)timer.fn();globalThis.document=documentBefore;globalThis.window=windowBefore;globalThis.File=fileBefore;if(navigatorBefore)Object.defineProperty(globalThis,'navigator',navigatorBefore);else delete globalThis.navigator}};
}
await check('desktop anchor click stays synchronous even when an observer throws',async()=>{
 const f=deliveryFixture({observer(){throw Error('observer failure')}});try{assert.equal(f.run(),'requested');assert.equal(f.anchors.length,1);assert(f.events.indexOf('click:a')<f.events.indexOf('audit:download_requested'));assert(f.anchors[0].removed)}finally{f.restore()}
});
await check('mobile panel alone never invents a save and native share is invoked in the click stack',async()=>{
 const seen=[],f=deliveryFixture({mobile:true,observer:(type,meta)=>seen.push({type,meta})});try{assert.equal(f.run(),'panel');assert.deepEqual(seen.map(e=>e.type),['save_panel_opened']);f.nodes.get('#save').click();assert.deepEqual(seen.map(e=>e.type),['save_panel_opened','save_clicked']);f.nodes.get('#share').click();assert(f.events.includes('native_share'),'share called synchronously without awaiting telemetry');assert(!seen.some(e=>e.type==='share_handoff'));await turns();assert(seen.some(e=>e.type==='share_handoff'));assert.equal(dismissFileSavePanel(),true);assert.equal(dismissFileSavePanel(),false);assert.equal(seen.filter(e=>e.type==='panel_closed').length,1)}finally{f.restore()}
});
await check('native share cancellation is distinguished from a genuine share error',async()=>{
 for(const kind of ['cancel','throw']){const seen=[],f=deliveryFixture({mobile:true,shareResult:kind,observer:(type,meta)=>seen.push({type,meta})});try{f.run();f.nodes.get('#share').click();await turns();const outcome=seen.find(e=>e.type===(kind==='cancel'?'share_cancelled':'download_failed'));assert(outcome);assert.equal(outcome.meta.errorCode,kind==='cancel'?'share_cancelled':'share_failed');assert(!JSON.stringify(seen).includes('private'));assert(!seen.some(e=>e.type==='share_handoff'))}finally{f.restore()}}
});
await check('project JSON delivery never produces photo audit events',async()=>{
 for(const mobile of [false,true]){const seen=[],f=deliveryFixture({mobile,type:'application/json',observer:type=>seen.push(type)});try{assert.equal(f.run(),mobile?'panel':'requested');if(mobile){f.nodes.get('#save').click();f.nodes.get('#share').click();await turns();dismissFileSavePanel()}assert.deepEqual(seen,[])}finally{f.restore()}}
});
console.log(JSON.stringify({passed:checks.length,failed:0,scope:'Local audit-client failure and real delivery-helper checks; no live account/payment/AI calls.'}));
