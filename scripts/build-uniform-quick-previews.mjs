import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),paths=new Set();
for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){
 const block=source.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))?.[0];if(!block)throw Error('Missing catalog '+name);
 const items=Function(block+';return '+name)();
 for(const item of items)paths.add(item.template||item.img);
}
const destination=new URL('../public/assets/uniform-quick-previews/',import.meta.url);await mkdir(destination,{recursive:true});
const thumbDestination=new URL('../public/assets/uniform-picker-thumbnails/',import.meta.url);await mkdir(thumbDestination,{recursive:true});
const map={},thumbMap={};
for(const path of paths){
 const name=path.replace(/^\/assets\//,'').replace(/\.[^.]+$/,'').replaceAll('/','--')+'.webp';
 const input=fileURLToPath(new URL('../public'+path,import.meta.url));
 // 512px is the editable canvas preview. Do not use this larger image for
 // the ~96px picker tiles, and never replace the native export PNG.
 await sharp(input).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:88,alphaQuality:100,effort:4}).toFile(fileURLToPath(new URL(name,destination)));
 const thumb=await sharp(input).resize({width:192,height:192,fit:'inside',withoutEnlargement:true}).webp({quality:76,alphaQuality:90,effort:4}).toBuffer();
 const hash=crypto.createHash('sha256').update(thumb).digest('hex').slice(0,12),thumbName=name.replace(/\.webp$/,'.'+hash+'.webp');
 await writeFile(new URL(thumbName,thumbDestination),thumb);
 map[path]='/assets/uniform-quick-previews/'+name;
 thumbMap[path]='/assets/uniform-picker-thumbnails/'+thumbName;
}
await writeFile(new URL('../src/uniform-quick-previews.json',import.meta.url),JSON.stringify(map,null,2)+'\n');
await writeFile(new URL('../src/uniform-picker-thumbnails.json',import.meta.url),JSON.stringify(thumbMap,null,2)+'\n');
console.log('Created '+paths.size+' suit editor previews (512px) and picker thumbnails (192px). Native export assets unchanged.');
