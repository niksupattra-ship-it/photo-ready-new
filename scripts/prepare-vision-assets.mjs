import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const assets=path.join(root,'public/assets/vision/mediapipe-1.0.1');
const runtime=path.join(root,'node_modules/@mediapipe/tasks-vision');
const pkg=JSON.parse(await readFile(path.join(runtime,'package.json'),'utf8'));
if(pkg.version!=='1.0.1')throw Error('MediaPipe runtime must match the bundled 1.0.1 models');
const manifest=JSON.parse(await readFile(path.join(assets,'models.json'),'utf8'));
for(const [name,model] of Object.entries(manifest.models)){
 const bytes=await readFile(path.join(assets,name));
 if(bytes.length!==model.bytes||createHash('sha256').update(bytes).digest('hex')!==model.sha256)throw Error('Bundled vision model checksum mismatch: '+name);
}
const wasm=path.join(assets,'wasm');await mkdir(wasm,{recursive:true});
for(const variant of ['vision_wasm_internal','vision_wasm_module_internal','vision_wasm_nosimd_internal'])for(const extension of ['js','wasm']){
 const name=variant+'.'+extension;await copyFile(path.join(runtime,'wasm',name),path.join(wasm,name));
}
console.info('Pinned browser vision assets ready (same origin, no runtime downloads)');
