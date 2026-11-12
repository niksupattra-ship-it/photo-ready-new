import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {uniformMatchesSearch} from '../src/uniform-search.js';

const addedIds=[
 'female-job-ivory-tweed-burgundy-trim-gold-buttons',
 'female-job-ivory-bow-collar-blouse',
 'female-job-powder-blue-knit-peter-pan-collar',
 'female-job-taupe-ribbed-round-neck-cardigan',
 'female-job-dusty-blue-tailored-blazer-ivory-top',
 'female-job-blush-pink-tweed-burgundy-trim',
 'female-job-sand-beige-wide-lapel-blazer',
 'female-job-charcoal-pinstripe-tailored-blazer',
 'female-job-ivory-pleated-round-neck-blouse',
 'female-job-deep-navy-double-breasted-blazer',
 'female-job-warm-taupe-blazer-beige-shirt',
 'female-job-cream-neck-tie-blouse',
 'female-job-sage-blue-mandarin-collar-jacket',
 'female-job-rose-pink-tweed-collarless-pockets',
 'female-job-midnight-navy-blazer-cream-ruffle-blouse',
 'female-job-royal-blue-blazer-white-collar-shirt',
 'male-job-black-suit-silver-gray-tie',
 'male-job-slate-navy-suit-burgundy-tie',
 'male-job-charcoal-gray-suit-burgundy-tie',
 'male-job-midnight-black-suit-textured-silver-tie'
];

async function jobCatalogue(){
 const js=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const declaration=js.match(/const JOB_UNIFORMS=\[[\s\S]*?\n\];/)?.[0];
 assert(declaration,'job catalogue declaration must remain build-tool readable');
 return Function(declaration+';return JOB_UNIFORMS')();
}

test('16 women and 4 men added under existing job category with meaningful Thai/English search metadata',async()=>{
 const jobs=await jobCatalogue();
 const allIds=new Set(jobs.map(v=>v.id));assert.equal(allIds.size,jobs.length,'duplicate IDs not allowed');
 assert.equal(addedIds.length,20);
 const items=addedIds.map(id=>jobs.find(i=>i.id===id));
 assert(items.every(Boolean),'all imported ZIP garments must appear in the job category');
 assert.equal(items.filter(i=>i.gender==='female').length,16);
 assert.equal(items.filter(i=>i.gender==='male').length,4);
 for(const item of items){
  assert.equal(item.cat,'job');
  assert.equal(item.template,`/assets/job-uniforms/${item.id}.webp`);
  assert.equal(item.img,item.template);
  assert.match(item.title,/[ก-๙]/,'searchable Thai garment name');
  assert.match(item.titleEn,/[a-z]/i,'searchable English garment name');
  assert(item.searchKeywords.length>32,'descriptive colour/style/fabric keywords');
  assert(uniformMatchesSearch(item,item.title),'Thai title is searchable');
  assert(uniformMatchesSearch(item,item.titleEn),'English title is searchable');
  assert(uniformMatchesSearch(item,'job application'),'common English job query');
  assert(uniformMatchesSearch(item,'สมัครงาน'),'common Thai job query');
 }
});

test('all 20 imported garments remain full-resolution transparent original-aspect templates',async()=>{
 const jobs=await jobCatalogue();
 for(const id of addedIds){
  const option=jobs.find(item=>item.id===id),file=new URL('../public'+option.template,import.meta.url);
  const image=sharp(await readFile(file)),meta=await image.metadata();
  assert.equal(meta.format,'webp',id);
  assert.equal(meta.width,1504,id);
  assert.equal(meta.height,1285,id);
  assert.equal(meta.hasAlpha,true,id);
  const stats=await image.ensureAlpha().extractChannel(3).stats();
  assert.equal(stats.channels[0].min,0,id);
  assert.equal(stats.channels[0].max,255,id);
 }
});

test('job outfit cards remain image-only in both language modes',async()=>{
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert.match(editor,/\(visiblePicker!=='suit'\|\|!isJobOutfit\(o\)\)\&\&<small>/);
 // This condition is shared by Thai and English; labels remain in the search metadata.
 assert.match(editor,/uniformMatchesSearch\(o,suitSearch\)/);
});
