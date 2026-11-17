import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {productionHair,PRODUCTION_HAIR_CATALOG,selectedHairDesign} from '../hairstyle-catalog.js';
import {loadCatalogueHairGuide} from '../catalogue-hair-guide.js';
import {thaiCompactHairReference,THAI_COMPACT_HAIR_REFERENCE_CONTEXT} from '../thai-compact-hair-reference.js';

const root=new URL('..',import.meta.url).pathname;
const manifest=JSON.parse(await readFile(path.join(root,'public/assets/catalogue-hair-guides/v1/manifest.json'),'utf8'));
const ids=PRODUCTION_HAIR_CATALOG.filter(h=>!h.hidden&&h.interfaceLanguage!=='en'&&h.id.startsWith('seedream-')&&['short','gathered'].includes(selectedHairDesign(h)?.kind)).map(h=>h.id);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=await mkdtemp(path.join(tmpdir(),'compact-hair-context-'));
after(()=>rm(temp,{recursive:true,force:true}));
async function fixture(name,id='seedream-41'){
 const dir=path.join(temp,name),entry=manifest.entries[id];
 await mkdir(path.join(dir,'public/assets/catalogue-hair-guides/v1'),{recursive:true});
 await mkdir(path.dirname(path.join(dir,'public',entry.preview.slice(1))),{recursive:true});
 await writeFile(path.join(dir,'public/assets/catalogue-hair-guides/v1/manifest.json'),JSON.stringify(manifest));
 await writeFile(path.join(dir,'public',entry.preview.slice(1)),await readFile(path.join(root,'public',entry.preview.slice(1))));
 return dir;
}

test('Thai female braided crown, female short cut and male short cut preserve every isolated hair pixel in one reference board',async()=>{
 for(const id of ids){
  const selected=productionHair(id),entry=manifest.entries[id],hair=await loadCatalogueHairGuide(id,root),preview=await readFile(path.join(root,'public',selected.src.slice(1)));
  const hashes=[digest(hair),digest(preview)];
  const board=await thaiCompactHairReference({selected,hair,root}),metadata=await sharp(board).metadata();
  assert.equal(metadata.width,1024);assert.equal(metadata.height,768);assert.equal(metadata.hasAlpha,false);
  const expected=await sharp(hair).flatten({background:'#356bd8'}).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const actual=await sharp(board).extract({left:Math.round((512-expected.info.width)/2),top:48,width:expected.info.width,height:expected.info.height}).removeAlpha().raw().toBuffer();
  assert(actual.equals(expected.data),id+' must keep the full untrimmed selected design');
  assert.deepEqual([digest(await loadCatalogueHairGuide(id,root)),digest(await readFile(path.join(root,'public',entry.preview.slice(1))))],hashes,'Stored guide and picker bytes are immutable');
 }
});

test('the right panel blanks donor facial features while preserving the neck-side negative space from the matching picker',async()=>{
 for(const id of ids){
  const selected=productionHair(id),entry=manifest.entries[id],hair=await loadCatalogueHairGuide(id,root),preview=await readFile(path.join(root,'public',entry.preview.slice(1)));
  const board=await thaiCompactHairReference({selected,hair,root});
  const scale=Math.min(480/entry.width,704/entry.height),width=Math.round(entry.width*scale),height=Math.round(entry.height*scale),left=512+Math.round((512-width)/2);
  for(const index of [1,0,61,291]){
   const point=entry.face[index],x=left+Math.floor(point.x*entry.width*scale),y=48+Math.floor(point.y*entry.height*scale);
   assert.deepEqual([...await sharp(board).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer()],[189,195,203],id+' donor feature '+index+' must be neutral');
  }
  // The entire lower region below the donor chin mask stays exactly as shown
  // in the selected photograph: real neck skin and clear space, not hair fills.
  const bottom=Math.min(entry.height,Math.max(...Object.values(entry.face).map(p=>p.y*entry.height))+entry.width*.02);
  // Normalize the native WebP decode before resizing, matching the context's
  // PNG intermediate and avoiding decoder shrink-on-load colour differences.
  const decodedPreview=await sharp(preview).png().toBuffer();
  const top=Math.ceil(bottom*scale)+6,expected=await sharp(decodedPreview).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).removeAlpha().extract({left:0,top,width,height:height-top}).raw().toBuffer();
  const actual=await sharp(board).extract({left,top:48+top,width,height:height-top}).removeAlpha().raw().toBuffer();
  assert(actual.equals(expected),id+' neck/context pixels outside the identity mask must stay exact');
 }
 assert.match(THAI_COMPACT_HAIR_REFERENCE_CONTEXT,/RIGHT.*absence of hair below the ears/);
 assert.match(THAI_COMPACT_HAIR_REFERENCE_CONTEXT,/generation reference only/);
});

test('English, long, bob, free-PNG and absent hair references remain the exact supplied buffer',async()=>{
 const hair=await loadCatalogueHairGuide('seedream-41',root);
 for(const selected of [productionHair('seedream-53'),productionHair('seedream-42'),productionHair('seedream-05'),{id:'hair-25',gender:'female'},null])assert.equal(await thaiCompactHairReference({selected,hair,root}),hair);
 assert.equal(await thaiCompactHairReference({selected:productionHair('seedream-41'),hair:null,root}),null);
});

test('a mismatched catalog mapping, changed preview or altered isolated guide cannot silently select a different reference',async()=>{
 const selected=productionHair('seedream-41'),hair=await loadCatalogueHairGuide(selected.id,root);
 await assert.rejects(thaiCompactHairReference({selected:{...selected,src:productionHair('seedream-40').src},hair,root}),{code:'hairstyle_boundary_reference_unavailable'});
 await assert.rejects(thaiCompactHairReference({selected,hair:Buffer.concat([hair,Buffer.from('changed')]),root}),{code:'hairstyle_boundary_reference_unavailable'});
 const changedRoot=await fixture('changed-preview');await writeFile(path.join(changedRoot,'public',selected.src.slice(1)),Buffer.from('different preview'));
 await assert.rejects(thaiCompactHairReference({selected,hair,root:changedRoot}),{code:'hairstyle_boundary_reference_unavailable'});
});

test('only immutable manifest metadata is cached; each use still verifies the current photographic preview',async()=>{
 const selected=productionHair('seedream-41'),hair=await loadCatalogueHairGuide(selected.id,root),fixtureRoot=await fixture('manifest-cache');
 await thaiCompactHairReference({selected,hair,root:fixtureRoot});
 await writeFile(path.join(fixtureRoot,'public',selected.src.slice(1)),Buffer.from('changed after first read'));
 await assert.rejects(thaiCompactHairReference({selected,hair,root:fixtureRoot}),{code:'hairstyle_boundary_reference_unavailable'});
});
