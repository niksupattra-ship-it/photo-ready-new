import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,''),maskDirectory=process.argv[2]||'/tmp/idprom-picker-guides',out=root+'/public/assets/catalogue-hair-guides/v1';await mkdir(out,{recursive:true});
const evidence=JSON.parse(await readFile(maskDirectory+'/evidence.json','utf8')),hash=b=>createHash('sha256').update(b).digest('hex'),manifest={version:'picker-hair-v1',entries:{}};
for(const item of PRODUCTION_HAIR_CATALOG){
 const preview=await readFile(root+'/public'+item.src),raw=await sharp(preview).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mask=await sharp(item.id==='seedream-07'?await readFile(root+'/public/assets/seedream-hairstyles/references/7-preview-hair.png'):await readFile(maskDirectory+'/'+item.id+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(raw.info.width!==mask.info.width||raw.info.height!==mask.info.height)throw Error('Mask dimensions '+item.id);
 let pixels=0;for(let i=0;i<raw.info.width*raw.info.height;i++){const j=i*4;raw.data[j+3]=Math.min(raw.data[j+3],mask.data[j+3]);if(raw.data[j+3])pixels++;else raw.data[j]=raw.data[j+1]=raw.data[j+2]=255}
 const guide=await sharp(raw.data,{raw:{width:raw.info.width,height:raw.info.height,channels:4}}).png().toBuffer();await writeFile(out+'/'+item.id+'.png',guide);
 const e=evidence.find(x=>x.id===item.id),ids=[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249,61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146,10,1,152,234,454];
 manifest.entries[item.id]={preview:item.src,previewSha256:hash(preview),guideSha256:hash(guide),width:raw.info.width,height:raw.info.height,hairPixels:pixels,face:Object.fromEntries(ids.map(id=>[id,e.face[id]]))};
}
await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({guides:Object.keys(manifest.entries).length,bytes:(await Promise.all(PRODUCTION_HAIR_CATALOG.map(i=>readFile(out+'/'+i.id+'.png')))).reduce((a,b)=>a+b.length,0)}));
