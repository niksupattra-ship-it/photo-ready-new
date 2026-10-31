import {readFile,writeFile,mkdir} from 'node:fs/promises';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),paths=new Set();
for(const name of ['JOB_UNIFORMS','STUDENT_UNIFORMS','GOWN_UNIFORMS','INTERIOR_UNIFORMS','FEMALE_GOVERNMENT_UNIFORMS']){
 const block=source.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))?.[0];if(!block)throw Error('Missing catalog '+name);
 const items=Function(block+';return '+name)();
 for(const item of items)paths.add(item.template||item.img);
}
const destination=new URL('../public/assets/uniform-quick-previews/',import.meta.url);await mkdir(destination,{recursive:true});
const map={};
for(const path of paths){
 const name=path.replace(/^\/assets\//,'').replace(/\.[^.]+$/,'').replaceAll('/','--')+'.webp';
 await sharp(fileURLToPath(new URL('../public'+path,import.meta.url))).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:90,alphaQuality:100,effort:5}).toFile(fileURLToPath(new URL(name,destination)));
 map[path]='/assets/uniform-quick-previews/'+name;
}
await writeFile(new URL('../src/uniform-quick-previews.json',import.meta.url),JSON.stringify(map,null,2)+'\n');
console.log('Created '+paths.size+' display-only garment previews. Full-resolution originals are unchanged.');
