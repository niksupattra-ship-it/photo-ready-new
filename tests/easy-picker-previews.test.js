import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';
import backgrounds from '../src/background-picker-previews.json' with {type:'json'};
import uniforms from '../src/uniform-picker-thumbnails.json' with {type:'json'};
import {backgroundPickerPreview} from '../src/background-picker-preview.js';
import {hairPickerPreview} from '../src/hair-picker-preview.js';
import {outfitPickerPreview} from '../src/outfit-choice-preview.js';
import {publicAssetHeaders} from '../public-assets-cache.js';

test('all five background tiles are embedded, bounded previews with no menu network requests',async()=>{
 let total=0;
 assert.equal(Object.keys(backgrounds).length,5);
 for(const [source,preview] of Object.entries(backgrounds)){
  assert.equal(backgroundPickerPreview(source+'?v=1'),preview);
  assert.match(preview,/^data:image\/webp;base64,/);
  const bytes=Buffer.from(preview.split(',')[1],'base64'),meta=await sharp(bytes).metadata();
  assert(meta.width<=160&&meta.height<=160);total+=bytes.length;
 }
 assert(total<3000,'The complete background menu should remain tiny');
 for(const source of [undefined,null,'','__proto__','/other.jpg','https://example.invalid/assets/background.jpg'])assert.equal(backgroundPickerPreview(source),source);
});

test('uniform picker URLs are content-versioned and use the existing immutable public cache',async()=>{
 assert.equal(Object.keys(uniforms).length,75);
 for(const [source,url] of Object.entries(uniforms)){
  assert.equal(outfitPickerPreview({template:source},source),url);
  assert.match(url,/\.[a-f0-9]{12}\.webp$/);
  const bytes=await readFile(new URL('../public'+url,import.meta.url));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,12);
  assert(url.endsWith('.'+hash+'.webp'));
  const headers={};publicAssetHeaders({setHeader:(name,value)=>headers[name]=value},'/public'+url);
  assert.equal(headers['Cache-Control'],'public, max-age=31536000, immutable');
 }
});

test('display mappings do not mutate source choices or replace their native URLs',()=>{
 const hair=Object.freeze({id:'seedream-40',src:'/assets/seedream-hairstyles/previews/40.webp'});
 const uniform=Object.freeze({id:'suit',template:Object.keys(uniforms)[0]});
 assert.notEqual(hairPickerPreview(hair.src),hair.src);
 assert.notEqual(outfitPickerPreview(uniform,uniform.template),uniform.template);
 assert.equal(hair.src,'/assets/seedream-hairstyles/previews/40.webp');
 assert.equal(uniform.template,Object.keys(uniforms)[0]);
});
