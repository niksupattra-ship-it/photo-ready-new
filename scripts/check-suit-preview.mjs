import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import map from '../src/uniform-quick-previews.json' with {type:'json'};
import {createSuitPreviewRequest} from '../src/studio-suit-preview.js';
const source=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const catalog=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
await check('every catalog garment has a bounded alpha preview with the original aspect ratio',async()=>{
 const paths=new Set();for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){const block=catalog.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))[0];for(const item of Function(block+';return '+name)())paths.add(item.template||item.img)}
 assert.deepEqual(new Set(Object.keys(map)),paths);
 for(const [path,preview]of Object.entries(map)){const original=await sharp(new URL('../public'+path,import.meta.url).pathname).metadata(),small=await sharp(new URL('../public'+preview,import.meta.url).pathname).metadata();assert(small.width<=512&&small.height<=512);assert(small.hasAlpha);assert(Math.abs(small.width/small.height-original.width/original.height)<.01);assert(original.width>small.width)}
});
await check('a superseded load stops waiting immediately and cannot cancel the latest selection',async()=>{
 const first=createSuitPreviewRequest(),next=createSuitPreviewRequest(),waiting=first.wait(new Promise(()=>{}));first.cancel();await assert.rejects(waiting,{code:'SUIT_SELECTION_REPLACED'});assert.equal(await next.wait(Promise.resolve('original pixels')),'original pixels');
});
const extract=(start,end,name,env)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return Function('env',`with(env){${source.slice(a,b)};return ${name}}`)(env)};
await check('save and download cannot serialize or redeem while the displayed garment is provisional',async()=>{
 const messages=[],env={suitRequestRef:{current:{}},setStatus:message=>messages.push(message)};
 const exportImage=extract(' const exportImage=async','\n const autoDownloadAttempted=','exportImage',env),save=extract(' const save=async','\n const ', 'save',env);
 await exportImage('image/png');await exportImage('image/png',{automatic:true});assert.equal(await save(),false);assert.equal(messages.length,3);assert(messages.every(message=>message.includes('ความละเอียดเต็ม')));
});
await check('automatic download waits for the committed full-resolution suit and runs only once',()=>{
 const start=source.indexOf(' const autoDownloadAttempted='),a=source.indexOf('useEffect(()=>{',start)+'useEffect(()=>{'.length,b=source.indexOf('},[downloadUnlockSignal',a),calls=[];
 const env={downloadUnlockSignal:{id:'unlock',jobId:'job'},autoDownloadAttempted:{current:new Set()},ready:true,suitRequestRef:{current:{}},state:{current:[{jobId:'job'}]},outputHeads:layers=>layers,exportImage:(...args)=>calls.push(args)};
 const effect=Function('env',`with(env){${source.slice(a,b)}}`);effect(env);assert.equal(calls.length,0);assert.equal(env.autoDownloadAttempted.current.size,0);env.suitRequestRef.current=null;effect(env);effect(env);assert.equal(calls.length,1);assert.deepEqual(calls[0],['image/png',{automatic:true}]);
});
console.log(JSON.stringify({passed,scope:'Actual selection cancellation, catalog assets, production save/export guards and automatic-download effect; no real account or payment requests.'}));
