import test from 'node:test';
import assert from 'node:assert/strict';
import {createEasyPreviewWarmer} from '../src/easy-preview-warmup.js';
const url=index=>'/assets/hair-picker-thumbnails/hair-'+index+'.aaaaaaaaaaaa.webp';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('preview warming starts no more than two downloads and cancels queued work',async()=>{
 const calls=[],release=[];
 const warmer=createEasyPreviewWarmer({load:source=>{calls.push(source);return new Promise(resolve=>release.push(resolve))}});
 const request=warmer.warm([url(1),url(2),url(3),url(4)]);
 await tick();assert.deepEqual(calls,[url(1),url(2)]);
 request.cancel();release.forEach(resolve=>resolve({}));await request.done;
 assert.deepEqual(calls,[url(1),url(2)]);
});

test('customer URLs, native assets, external URLs and duplicate choices never cause extra warm downloads',async()=>{
 const calls=[];const warmer=createEasyPreviewWarmer({load:async source=>{calls.push(source);return {}}});
 await warmer.warm([url(1),url(1),'/assets/job-uniforms/native.png','blob:customer','data:image/png;base64,AA==','https://other.invalid'+url(1)]).done;
 await warmer.warm([url(1)]).done;
 assert.deepEqual(calls,[url(1)]);
});

test('concurrent warm requests share a download and a failed attempt may retry',async()=>{
 let attempts=0,release;
 const warmer=createEasyPreviewWarmer({load:()=>{attempts++;return new Promise((resolve,reject)=>{release={resolve,reject}})}});
 const first=warmer.warm([url(1)]),second=warmer.warm([url(1)]);
 await tick();assert.equal(attempts,1);release.reject(Error('offline'));await Promise.all([first.done,second.done]);
 const retry=warmer.warm([url(1)]);await tick();assert.equal(attempts,2);release.resolve({});await retry.done;
});

test('retained decoded previews have a bounded cache',async()=>{
 const calls=[];const warmer=createEasyPreviewWarmer({capacity:1,load:async source=>{calls.push(source);return {}}});
 await warmer.warm([url(1)]).done;await warmer.warm([url(2)]).done;await warmer.warm([url(1)]).done;
 assert.deepEqual(calls,[url(1),url(2),url(1)]);
});
