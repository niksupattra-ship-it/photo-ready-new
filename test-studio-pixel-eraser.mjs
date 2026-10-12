import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {strokeSampler,pixelEraserStroke,preparePixelSurface,brushSceneRegion} from './src/studio-pixel-eraser.js';

class Surface{
 constructor(w=1,h=1){this._w=w;this._h=h;this.data=new Uint8ClampedArray(w*h*4);this.reads=[];this.writes=0;this.ctx=new Context(this)}
 get width(){return this._w}set width(n){this._w=n;this.data=new Uint8ClampedArray(this._w*this._h*4)}
 get height(){return this._h}set height(n){this._h=n;this.data=new Uint8ClampedArray(this._w*this._h*4)}
 getContext(){return this.ctx}
 toDataURL(){return 'data:image/png;base64,'+Buffer.from(JSON.stringify({w:this.width,h:this.height,data:[...this.data]})).toString('base64')}
}
class Context{
 constructor(c){this.canvas=c;this.globalCompositeOperation='source-over'}
 getImageData(x,y,w,h){this.canvas.reads.push({x,y,w,h});const data=new Uint8ClampedArray(w*h*4);for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)data.set(this.canvas.data.slice(((y+yy)*this.canvas.width+x+xx)*4,((y+yy)*this.canvas.width+x+xx)*4+4),(yy*w+xx)*4);return {data,width:w,height:h}}
 putImageData(image,x,y){this.canvas.writes++;for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++)this.canvas.data.set(image.data.slice((yy*image.width+xx)*4,(yy*image.width+xx)*4+4),((y+yy)*this.canvas.width+x+xx)*4)}
 drawImage(src,...args){const [dx=0,dy=0,dw=src.width,dh=src.height]=args;for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const sx=Math.floor(x*src.width/dw),sy=Math.floor(y*src.height/dh),j=((dy+y)*this.canvas.width+dx+x)*4,k=(sy*src.width+sx)*4;if(this.globalCompositeOperation==='destination-in')this.canvas.data[j+3]=Math.round(this.canvas.data[j+3]*src.data[k+3]/255);else this.canvas.data.set(src.data.slice(k,k+4),j)}}
 clearRect(x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)this.canvas.data.fill(0,(yy*this.canvas.width+xx)*4,(yy*this.canvas.width+xx)*4+4)}
 fillRect(x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)this.canvas.data.set([255,255,255,255],(yy*this.canvas.width+xx)*4)}
}
const copy=src=>{if(!src)return null;const c=new Surface(src.width,src.height);c.data.set(src.data);return c};
const photo=()=>{const c=new Surface(160,100);for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)c.data.set([80+x,100+y,77,255],(y*c.width+x)*4);return c};
const alpha=(c,x,y)=>c.data[(y*c.width+x)*4+3];

for(const stabilize of [0,.15,.5])test(`stroke sampling is independent of 16/64/256 input events, stabilization ${stabilize}`,()=>{
 const outputs=[];for(const n of [16,64,256]){const points=[],s=strokeSampler(2.4,p=>points.push(p),stabilize);s.add({x:20,y:40});for(let i=1;i<=n;i++)s.add({x:20+80*i/n,y:40});s.finish();outputs.push(points)}
 for(const points of outputs.slice(1)){assert.equal(points.length,outputs[0].length);for(let i=0;i<points.length;i++){assert.ok(Math.abs(points[i].x-outputs[0][i].x)<1e-7);assert.equal(points[i].y,40)}}assert.deepEqual(outputs[0].at(-1),{x:100,y:40});
});
test('sampling keeps turns, ignores repeated stationary input and includes the final tip',()=>{
 const points=[],s=strokeSampler(5,p=>points.push(p));s.add({x:20,y:20});for(let i=0;i<40;i++)s.add({x:20,y:20});s.add({x:40,y:20});s.add({x:40,y:42});s.finish();assert.equal(points.length,10);assert.ok(points.some(p=>p.x===40&&p.y===20));assert.deepEqual(points.at(-1),{x:40,y:42});
});
for(const softness of [0,30,95])test(`actual RGBA erasure is identical at different event frequencies, softness ${softness}`,()=>{
 const outputs=[];for(const n of [16,64,256]){const src=photo(),base=copy(src),s=pixelEraserStroke(src,base,{radius:20,softness,opacity:.25,stabilize:.15});s.add({x:20,y:40});for(let i=1;i<=n;i++){s.add({x:20+80*i/n,y:40});if(i%4===0)s.flush()}s.finish();s.flush();outputs.push(src.data);assert.deepEqual(base.data,photo().data)}
 for(const data of outputs.slice(1))assert.deepEqual(data,outputs[0]);
});
test('one stroke never exceeds its opacity and a second stroke can erase more',()=>{
 const src=photo(),base=copy(src),s=pixelEraserStroke(src,base,{radius:20,opacity:.25});for(let i=0;i<100;i++)s.add({x:40,y:40});s.finish();s.flush();assert.equal(alpha(src,40,40),191);
 const next=pixelEraserStroke(src,base,{radius:20,opacity:.25});next.add({x:40,y:40});next.flush();assert.equal(alpha(src,40,40),143);
});
test('soft edge is graded and all RGB and pixels outside the brush remain exact',()=>{
 const src=photo(),before=copy(src),s=pixelEraserStroke(src,before,{radius:20,softness:95});s.add({x:60,y:40});s.flush();const ramp=[];for(let x=61;x<80;x++)ramp.push(alpha(src,x,40));assert.ok(ramp.filter(a=>a>0&&a<255).length>10);assert.ok(ramp.every((a,i)=>!i||a>=ramp[i-1]));
 for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){const j=(y*src.width+x)*4;assert.deepEqual(src.data.slice(j,j+3),before.data.slice(j,j+3));if(Math.hypot(x+.5-60,y+.5-40)>=20)assert.deepEqual(src.data.slice(j,j+4),before.data.slice(j,j+4))}
});
test('restore recovers the actual reference pixels without generating skin or filling original transparency',()=>{
 const base=photo();base.data[(40*base.width+60)*4+3]=0;const src=copy(base),s=pixelEraserStroke(src,base,{radius:20,softness:0});s.add({x:60,y:40});s.flush();const restore=pixelEraserStroke(src,base,{radius:20,softness:0,restore:true});restore.add({x:60,y:40});restore.flush();for(const x of [55,60,65]){const j=(40*src.width+x)*4;assert.deepEqual(src.data.slice(j,j+4),base.data.slice(j,j+4))}
});
test('brush reads and writes small tiles and flushes once per frame without PNG encoding',()=>{
 const src=photo(),base=copy(src);src.toDataURL=()=>{throw Error('PNG encoding during stroke')};const s=pixelEraserStroke(src,base,{radius:10});for(let i=0;i<100;i++)s.add({x:50+i*.1,y:40});assert.equal(src.writes,0);s.flush();assert.ok(src.writes<=2);assert.ok(src.reads.every(r=>r.w<=64&&r.h<=64));
});
test('legacy mask migrates into actual pixels once, retaining an untouched restore reference',()=>{
 const original=photo(),mask=photo();mask.data[(40*mask.width+60)*4+3]=80;const a={original,mask},l={source:'original'};const prepared=preparePixelSurface(a,l,copy);assert.equal(alpha(prepared.surface,60,40),80);assert.equal(alpha(prepared.reference,60,40),255);assert.equal(alpha(a.mask,60,40),255);assert.equal(l.source,a.original);assert.deepEqual(original.data,photo().data);assert.equal(preparePixelSurface(a,l,copy).surface,prepared.surface);
});
test('a reopened/undo snapshot is copied before further editing, not mutated through shared Canvas data',()=>{
 const saved=photo(),ref=copy(saved),a={original:saved,mask:photo(),directPixelsReady:true,eraseRestoreSource:ref},l={source:saved};const p=preparePixelSurface(a,l,copy),s=pixelEraserStroke(p.surface,p.reference,{radius:10});s.add({x:60,y:40});s.flush();assert.equal(alpha(saved,60,40),255);assert.equal(alpha(p.surface,60,40),0);assert.notEqual(l.source,saved);
});
test('editing a warped surface preserves the unwarped source and uses its existing geometry reference',()=>{
 const original=photo(),warped=copy(original),ref=copy(warped),a={original,warped,mask:photo(),eraseRestoreSource:ref,directPixelsReady:true},l={source:'original'};const p=preparePixelSurface(a,l,copy),s=pixelEraserStroke(p.surface,p.reference,{radius:10});s.add({x:60,y:40});s.flush();assert.equal(alpha(a.original,60,40),255);assert.equal(alpha(a.warped,60,40),0);assert.equal(l.source,'original');
});
for(const rotation of [-37,0,28])test(`dirty display bounds include a moved/scaled/rotated native tile at ${rotation}`,()=>{
 const layer={x:37,y:-18,rotation,scale:1.2,sourceFrame:{x:110,y:140,w:570,h:720}},surface={width:1254,height:1254},display={width:2256,height:3072},rect={x:200,y:100,w:64,h:64},region=brushSceneRegion(rect,layer,surface,display),c=Math.cos(rotation*Math.PI/180),s=Math.sin(rotation*Math.PI/180);
 for(const x of [rect.x,rect.x+rect.w])for(const y of [rect.y,rect.y+rect.h]){const u=110+x/1254*570-450,v=140+y/1254*720-600,px=(450+37+(u*c-v*s)*1.2)*2256/900,py=(600-18+(u*s+v*c)*1.2)*3072/1200;if(px>=0&&px<=display.width&&py>=0&&py<=display.height){assert.ok(px>=region.x&&px<=region.x+region.w);assert.ok(py>=region.y&&py<=region.y+region.h)}}
});
test('invalid stroke inputs fail before editing a surface',()=>{assert.throws(()=>strokeSampler(0,()=>{}));const src=photo(),before=copy(src);assert.throws(()=>pixelEraserStroke(src,before,{radius:NaN}));assert.deepEqual(src.data,before.data)});

const editor=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8');
const section=(start,end)=>editor.slice(editor.indexOf(start),editor.indexOf(end,editor.indexOf(start)));
function studio(){
 const original=photo(),mask=photo(),layer={id:'head',kind:'head',source:'data:image/png;base64,initial',scale:1,rotation:0,x:0,y:0,visible:true,sourceFrame:{x:0,y:0,w:160,h:100}},a={original,mask,dirty:false},frames=new Map();let seq=0;
 const context={HTMLCanvasElement:Surface,document:{createElement:()=>new Surface()},copySurface:copy,pixelEraserStroke,preparePixelSurface,brushSceneRegion,layerKind:l=>l.kind,state:{current:[layer]},assets:{current:new Map([['head',a]])},undo:{current:[]},redo:{current:[]},historyTruncatedRef:{},historyBoundaryNoticeRef:{},gesture:{current:null},selectedRef:{current:'head'},pointers:{current:new Map()},penPointerRef:{current:null},viewRef:{current:{}},W:900,H:1200,brush:40,soft:95,eraseOpacity:25,eraseStabilize:15,tool:'erase',current:layer,hydratingRef:{current:false},assetBusy:false,processActive:false,touch:false,picker:false,ready:true,comparing:false,mounted:{current:true},useRef:n=>({current:n}),useEffect:()=>{},flushTransforms:()=>{},commitView:()=>{},setRevision:()=>{},setLayers:n=>{context.layers=typeof n==='function'?n(context.state.current):n},setStatus:()=>{},point:e=>({x:e.clientX,y:e.clientY}),local:p=>p,updateCursor:()=>{},queueView:()=>{},warp:()=>{},canvasRef:{current:{width:2256,height:3072,getContext:()=>({})}},paintScene:()=>{},dirtyRegion:(a,r)=>{a.dirty=true;a.dirtyRect=r},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq},cancelAnimationFrame:id=>frames.delete(id)};
 const code=section(' const historySnapshot=',' const deleteLayer=')+section(' const paintFrame=',' const warp=')+section(' const warpFrame=',' const download=');
 const run=vm.runInNewContext(code+'\n({down,move,end,flushWarpFrame,historySnapshot})',context);
 const event=(x,y,id=1,type='pointermove')=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,type,preventDefault:()=>{},currentTarget:{setPointerCapture:()=>{}},nativeEvent:{getCoalescedEvents:()=>[]}});
 return {context,run,layer,a,original,event};
}
test('live pointer path uses one undo per stroke and includes the pointer-up endpoint before save',()=>{
 const f=studio();f.run.down(f.event(20,40,1,'pointerdown'));for(let i=0;i<80;i++)f.run.move(f.event(20+i,40));f.run.end(f.event(105,40,1,'pointerup'));assert.equal(f.context.undo.current.length,1);assert.ok(alpha(f.a.original,105,40)<255);assert.equal(alpha(f.original,105,40),255);assert.ok(f.layer.source instanceof Surface);assert.equal(f.context.gesture.current,null);
 const after=f.run.historySnapshot()[0];f.context.tool='restore';f.run.down(f.event(105,40,1,'pointerdown'));f.run.end(f.event(105,40,1,'pointerup'));assert.equal(f.context.undo.current.length,2);assert.equal(alpha(f.a.original,105,40),255);assert.ok(alpha(after.source,105,40)<255,'immutable undo retains the erased version');
});
test('switching from erase to two-finger pinch rolls back pixels and source metadata',()=>{
 const f=studio();f.run.down(f.event(40,40,1,'pointerdown'));assert.ok(alpha(f.a.original,40,40)<255);f.run.down(f.event(80,40,2,'pointerdown'));assert.equal(f.a.original,f.original);assert.equal(alpha(f.a.original,40,40),255);assert.equal(f.context.state.current[0].source,'data:image/png;base64,initial');assert.equal(f.context.undo.current.length,0);assert.equal(f.context.gesture.current.kind,'pinch');
});

test('suit/collar geometry keeps its existing eraser coordinates and source image',()=>{
 for(const parts of [false,true]){const f=studio();f.layer.kind=parts?'collar':'suit';if(parts)f.a.parts={left:photo(),right:photo()};f.run.down(f.event(60,40,1,'pointerdown'));f.run.end(f.event(60,40,1,'pointerup'));assert.equal(f.a.original,f.original);assert.equal(alpha(f.a.original,60,40),255);assert.ok(alpha(f.a.mask,60,40)<255);assert.equal(f.layer.source,'data:image/png;base64,initial');assert.equal(f.a.eraseRestoreSource,undefined)}
});

test('actual project snapshot round-trip retains erased pixels and the reference used by restore',async()=>{
 const f=studio();f.run.down(f.event(60,40,1,'pointerdown'));f.run.end(f.event(60,40,1,'pointerup'));
 const snapshot=vm.runInNewContext(section(' const snapshot=',' if(purchaseSnapshotRef)')+'\nsnapshot', {...f.context,surfaceURL:s=>s instanceof Surface?s.toDataURL():s});
 const saved=JSON.parse(JSON.stringify(snapshot())),erased=alpha(f.a.original,60,40);assert.ok(typeof saved[0].eraseRestoreSource==='string');
 const decode=async src=>{if(src instanceof Surface)return src;const d=JSON.parse(Buffer.from(src.split(',')[1],'base64').toString()),c=new Surface(d.w,d.h);c.data.set(d.data);return c};
 Object.assign(f.context,{image:decode,syncHairAttachments:n=>n,trialUnlocked:false,loading:{current:0},placementRef:{current:null},canvas:()=>new Surface(900,1200),layerKind:l=>l.kind,setReady:()=>{},setSelected:()=>{}});
 const hydrate=vm.runInNewContext(section(' async function hydrate(',' useEffect(()=>{mounted.current')+'\nhydrate',f.context);assert.equal(await hydrate(saved),true);
 const a=f.context.assets.current.get('head');assert.equal(alpha(a.original,60,40),erased);assert.equal(alpha(a.eraseRestoreSource,60,40),255);
 f.context.current=f.context.state.current[0];f.context.tool='restore';f.run.down(f.event(60,40,1,'pointerdown'));f.run.end(f.event(60,40,1,'pointerup'));assert.equal(alpha(a.original,60,40),255);
});

test('opening a legacy project keeps its appearance until its mask is migrated by the new eraser',async()=>{
 const f=studio(),mask=photo();mask.data[(40*mask.width+60)*4+3]=64;
 Object.assign(f.context,{image:async s=>s,syncHairAttachments:n=>n,trialUnlocked:false,loading:{current:0},placementRef:{current:null},canvas:()=>new Surface(900,1200),layerKind:l=>l.kind,setReady:()=>{},setSelected:()=>{}});
 const hydrate=vm.runInNewContext(section(' async function hydrate(',' useEffect(()=>{mounted.current')+'\nhydrate',f.context);assert.equal(await hydrate([{...f.layer,source:photo(),mask}]),true);
 const a=f.context.assets.current.get('head');assert.equal(alpha(a.mask,60,40),64);assert.equal(a.eraseRestoreSource,null);
 const layer=f.context.state.current[0],prepared=preparePixelSurface(a,layer,copy);assert.equal(alpha(prepared.surface,60,40),64);assert.equal(alpha(prepared.reference,60,40),255);
});
