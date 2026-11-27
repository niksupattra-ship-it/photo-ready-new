import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,THAI_FREE_MALE_HAIR_IDS} from '../hairstyle-catalog.js';
import {orderThaiFemaleSuits} from '../thai-female-suit-policy.js';

// Read the same trusted catalogue declarations as build-uniform-quick-previews.
// Do not maintain a second list or substitute thumbnails for AI reference files.
export async function buildProLabCatalogue(){
 const root=new URL('..',import.meta.url),source=await readFile(new URL('src/main.jsx',root),'utf8');
 const array=name=>{const block=source.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))?.[0];if(!block)throw Error('Missing catalogue '+name);return Function(block+';return '+name)();};
 const groups=[['JOB_UNIFORMS','job','สมัครงาน'],['FEMALE_GOVERNMENT_UNIFORMS','government','ข้าราชการ'],['INTERIOR_UNIFORMS','government','ข้าราชการ'],['GOWN_UNIFORMS','gown','ชุดครุย'],['STUDENT_UNIFORMS','student','นักศึกษา']];
 const outfits=[];
 for(const [name,group,groupName]of groups){let items=array(name);if(group==='job')items=orderThaiFemaleSuits(items);for(const item of items)outfits.push({id:item.id,name:item.title||item.name,gender:item.gender||(name==='FEMALE_GOVERNMENT_UNIFORMS'?'female':name==='INTERIOR_UNIFORMS'?'male':'all'),group,groupName,preview:item.preview||item.img,reference:item.template||item.img});}
 const start=source.indexOf('const BASIC_MALE_HAIR_IDS='),end=source.indexOf('const JOB_UNIFORMS=',start);
 if(start<0||end<start)throw Error('Missing visible hair selection');
 const hairOptions=Function('PRODUCTION_HAIR_CATALOG','THAI_FREE_FEMALE_HAIR_IDS','THAI_FREE_MALE_HAIR_IDS',source.slice(start,end)+';return [...STUDIO_FEMALE_HAIR_OPTIONS,...MALE_HAIR_OPTIONS]')(PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS,THAI_FREE_MALE_HAIR_IDS);
 const hairs=hairOptions.filter(item=>item.file&&!item.promptOnly).map(item=>({id:item.id,name:item.name,gender:item.gender,group:'hair',groupName:'ทรงผม',preview:item.src,reference:'/assets/'+(item.referenceDirectory==='hair'?'hair/':'seedream-hairstyles/references/')+item.file}));
 for(const item of [...outfits,...hairs]){if(!item.reference.startsWith('/assets/')||item.reference.includes('..'))throw Error('Invalid catalogue path');const bytes=await readFile(new URL('public'+item.reference,root));item.sha256=createHash('sha256').update(bytes).digest('hex');}
 return {outfits,hairs};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const catalogue=await buildProLabCatalogue();await writeFile(new URL('../public/seedream-pro-lab-catalogue.json',import.meta.url),JSON.stringify(catalogue,null,2)+'\n');const hashes={hair:Object.fromEntries(catalogue.hairs.map(x=>[x.id,x.sha256])),outfit:Object.fromEntries(catalogue.outfits.map(x=>[x.reference,x.sha256]))};await writeFile(new URL('../portrait-reference-assets.js',import.meta.url),'// Generated from the actual native catalogue reference files.\nexport const PORTRAIT_REFERENCE_HASHES='+JSON.stringify(hashes)+';\n');console.log(`Pro Lab catalogue: ${catalogue.outfits.length} outfits, ${catalogue.hairs.length} original hairstyle references`);}
