import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudioModuleLoader} from '../src/studio-module-loader.js';

test('photo warming and editor mounting share one import and retain the ready module',async()=>{
 let imports=0,release;
 const module={StudioEditor:()=>null};
 const loader=createStudioModuleLoader(()=>{imports++;return new Promise(resolve=>{release=resolve})});
 assert.equal(loader.current(),null);
 const first=loader.load(),second=loader.load();assert.equal(first,second);
 await Promise.resolve();assert.equal(imports,1);
 release(module);assert.equal(await first,module);assert.equal(loader.current(),module);
 assert.equal(await loader.load(),module);assert.equal(imports,1);
});

test('a failed network import can retry without replacing the project or reloading the page',async()=>{
 let imports=0;const module={StudioEditor:()=>null};
 const loader=createStudioModuleLoader(async()=>{if(++imports===1)throw Error('offline');return module});
 await assert.rejects(loader.load(),/offline/);assert.equal(loader.current(),null);
 assert.equal(await loader.load(),module);assert.equal(imports,2);
});

test('an unusable module is rejected and a later attempt is allowed',async()=>{
 let imports=0;const module={StudioEditor:()=>null};
 const loader=createStudioModuleLoader(async()=>++imports===1?{}:module);
 await assert.rejects(loader.load(),/unavailable/);
 assert.equal(await loader.load(),module);
});

test('a stalled download reaches a recoverable error instead of leaving the screen blocked',async()=>{
 let imports=0;const module={StudioEditor:()=>null};
 const loader=createStudioModuleLoader(()=>++imports===1?new Promise(()=>{}):Promise.resolve(module),{timeoutMs:10});
 await assert.rejects(loader.load(),/timed out/);assert.equal(loader.current(),null);
 assert.equal(await loader.load(),module);
});
