import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION} from '../catalogue-hair-policy.js';
const visibleCatalogue=PRODUCTION_HAIR_CATALOG.filter(item=>!item.hidden);
const root=new URL('..',import.meta.url),directory=new URL('public/assets/catalogue-hair-guides/v1/',root),manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(manifest.version!==HAIR_REFERENCE_VERSION||Object.keys(manifest.entries).length!==visibleCatalogue.length)throw Error('Catalogue hair guide version/count mismatch');
await Promise.all(visibleCatalogue.map(async item=>{
 const entry=manifest.entries[item.id];if(!entry||entry.preview!==item.src)throw Error('Missing picker hair mapping: '+item.id);
 const [preview,guide]=await Promise.all([readFile(new URL('public'+item.src,root)),readFile(new URL(item.id+'.png',directory))]);
 if(hash(preview)!==entry.previewSha256||hash(guide)!==entry.guideSha256)throw Error('Picker/AI hair guide changed without review: '+item.id+'; rebuild and review its hair-only guide');
}));
console.log('Verified exact picker hair guides: '+visibleCatalogue.length);
