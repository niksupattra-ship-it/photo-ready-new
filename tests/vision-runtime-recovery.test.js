import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisionRuntimeLoader,createCompatibleVisionModel} from '../src/vision-runtime.js';
test('a replaced hashed chunk falls back to stable runtime and concurrent callers share it',async()=>{
 let primary=0,fallback=0;const model={};const load=createVisionRuntimeLoader(async()=>{primary++;throw Error('Failed to fetch dynamically imported module')},async()=>{fallback++;return model});
 assert.deepEqual(await Promise.all([load(),load()]),[model,model]);assert.equal(primary,1);assert.equal(fallback,1);
});
test('both failed runtime loads can retry without reloading the photo',async()=>{
 let calls=0;const load=createVisionRuntimeLoader(async()=>{throw Error('offline')},async()=>{if(++calls===1)throw Error('offline');return 'ready'});
 await assert.rejects(load());assert.equal(await load(),'ready');
});
test('WASM initialization retries non SIMD with identical model and thresholds',async()=>{
 const options={baseOptions:{modelAssetPath:'face.task'},numFaces:1,minFaceDetectionConfidence:.5};const calls=[];
 const result=await createCompatibleVisionModel({root:'/vision',resolver:{forVisionTasks:async()=>({simd:true})},options,create:async(files,opts)=>{calls.push({files,opts});if(files.simd)throw Error('WASM unavailable');return 'model'}});
 assert.equal(result,'model');assert.equal(calls.length,2);assert.equal(calls[1].opts,options);assert.equal(calls[1].files.wasmBinaryPath,'/vision/vision_wasm_nosimd_internal.wasm');
});
test('all failed backends still reject face preflight',async()=>{
 await assert.rejects(createCompatibleVisionModel({root:'/vision',resolver:{forVisionTasks:async()=>{throw Error('SIMD unavailable')}},options:{},create:async()=>{throw Error('model unavailable')}}),/model unavailable/);
});
