import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the production handler, rather than a second serializer implementation.
const source=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const start=source.indexOf(' const snapshot=');
const end=source.indexOf('\n if(purchaseSnapshotRef)',start);
assert(start>=0&&end>start,'Studio snapshot handler not found');
const factory=new Function('state','assets','HTMLCanvasElement',source.slice(start,end)+';return snapshot;');
let checks=0;
const check=(name,run)=>{run();checks++;console.log('PASS '+name)};
class Surface{
 constructor(value){this.value=value;this.calls=0;this.width=2256;this.height=3072}
 toDataURL(){this.calls++;if(this.fail)throw this.fail;return 'data:image/png;base64,'+Buffer.from(this.value).toString('base64')}
}
const png=value=>'data:image/png;base64,'+Buffer.from(value).toString('base64');
const A=new Surface('source pixels'),B=new Surface('mask alpha');
const layer={id:'head',name:'หัว · คอ · ผม',kind:'head',jobId:'paid_fixture',x:13,y:-7,scale:1.25,rotation:12,opacity:.9,sourceFrame:{x:30,y:40,w:620,h:800},source:A,processedOriginalSource:A,makeupBaseSource:A,makeupFullSource:A,collarParts:{left:A,right:A},restrictedTrial:false};
const asset={mask:B,warped:A,warpBaseMask:B,eraseRestoreSource:A,warpRestoreBase:A};
const state={current:[layer]},assets={current:new Map([['head',asset]])};
const snapshot=factory(state,assets,Surface);
check('shared native surfaces encode once per snapshot across every saved field',()=>{
 const result=snapshot()[0];assert.equal(A.calls,1);assert.equal(B.calls,1);
 for(const key of ['source','processedOriginalSource','makeupBaseSource','makeupFullSource','warpSource','eraseRestoreSource','warpRestoreBase'])assert.equal(result[key],png('source pixels'));
 assert.deepEqual(result.collarParts,{left:png('source pixels'),right:png('source pixels')});assert.equal(result.mask,png('mask alpha'));assert.equal(result.warpBaseMask,png('mask alpha'));
 for(const key of ['id','name','kind','jobId','x','y','scale','rotation','opacity','sourceFrame','restrictedTrial'])assert.deepEqual(result[key],layer[key]);
 assert.equal(layer.source,A);assert.equal(asset.mask,B);assert.equal(A.width,2256);assert.equal(A.height,3072);
});
check('fresh snapshots encode in-place pixel edits and mask edits again',()=>{
 A.value='changed source pixels';B.value='changed alpha';const result=snapshot()[0];assert.equal(A.calls,2);assert.equal(B.calls,2);assert.equal(result.source,png(A.value));assert.equal(result.mask,png(B.value));
});
check('one snapshot also shares an encoding across layers without sharing mutable output records',()=>{
 state.current=[layer,{...layer,id:'other',x:80}];assets.current.set('other',asset);const before=A.calls;const result=snapshot();assert.equal(A.calls,before+1);assert.notEqual(result[0],result[1]);assert.equal(result[0].source,result[1].source);assert.equal(result[1].x,80);state.current=[layer];
});
check('distinct surface objects are not cached together even when their pixels match',()=>{
 const C=new Surface(A.value);state.current=[{...layer,source:C}];const before=A.calls;snapshot();assert.equal(C.calls,1);assert.equal(A.calls,before+1);state.current=[layer];
});
check('existing image strings and a missing asset retain original fallback semantics',()=>{
 const stored='data:image/webp;base64,AAAA',input={id:'stored',name:'ชุด',source:stored,processedOriginalSource:stored,mask:stored,collarParts:null};state.current=[input];const result=snapshot()[0];assert.equal(result.source,stored);assert.equal(result.mask,stored);assert.equal(result.processedOriginalSource,stored);assert.equal(result.collarParts,null);for(const key of ['warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'])assert.equal(result[key],null);assert.equal(input.source,stored);state.current=[layer];
});
check('native encoder errors still fail the snapshot and can be retried without stale cache',()=>{
 const failure=Object.assign(Error('blocked native encode'),{name:'SecurityError'});A.fail=failure;assert.throws(snapshot,e=>e===failure);delete A.fail;A.value='retry pixels';assert.equal(snapshot()[0].source,png('retry pixels'));
});
check('malformed existing assets still fail instead of silently dropping the saved mask',()=>{
 const old=assets.current.get('head');assets.current.set('head',{});assert.throws(snapshot,TypeError);assets.current.set('head',old);
});
console.log(JSON.stringify({passed:checks,scope:'actual Studio snapshot handler; deterministic canvas doubles, no app/account/network changes'}));
