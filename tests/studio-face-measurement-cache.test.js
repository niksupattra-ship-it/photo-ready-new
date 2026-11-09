import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFaceMeasurementCache} from '../src/studio-face-measurement-cache.js';
test('outfit switches share inference; edited pixels and dimensions invalidate it',async()=>{
 const measure=createFaceMeasurementCache();let calls=0;
 const detect=async()=>({id:++calls});
 const sample={width:2,height:2,pixels:new Uint8ClampedArray(16),canvas:{}};
 const [a,b]=await Promise.all([measure(sample,detect),measure({...sample,pixels:sample.pixels.slice()},detect)]);
 assert.equal(a,b);assert.equal(calls,1);
 sample.pixels[9]=255;
 assert.notEqual(await measure(sample,detect),a);assert.equal(calls,2);
 await measure({...sample,width:1,height:4},detect);assert.equal(calls,3);
});
test('failed measurements are retried and a different detector is never reused',async()=>{
 const measure=createFaceMeasurementCache(),sample={width:1,height:1,pixels:new Uint8ClampedArray(4),canvas:{}};
 let calls=0;const detect=async()=>{if(++calls===1)throw Error('retry');return 'face'};
 await assert.rejects(measure(sample,detect),/retry/);
 assert.equal(await measure(sample,detect),'face');assert.equal(calls,2);
 assert.equal(await measure(sample,async()=>'new'),'new');
});
