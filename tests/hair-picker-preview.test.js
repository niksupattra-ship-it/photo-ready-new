import test from 'node:test';
import assert from 'node:assert/strict';
import {hairPickerPreview} from '../src/hair-picker-preview.js';
import thumbnails from '../src/hair-picker-thumbnails.json' with {type:'json'};
import {publicAssetHeaders} from '../public-assets-cache.js';

test('versioned catalog URLs use the content-versioned small image without changing their original value',()=>{
 for(const [source,thumbnail] of Object.entries(thumbnails)){
  assert.equal(hairPickerPreview(source),thumbnail);
  assert.equal(hairPickerPreview(source+'?hair=changed-reference-version#display'),thumbnail);
  assert.match(thumbnail,/\/hair-picker-thumbnails\/[^/]+\.[a-f0-9]{12}\.webp$/);
 }
});
test('unknown sources, external images and other catalog assets keep their original URL',()=>{
 for(const source of [undefined,null,'','__proto__','/assets/job-uniforms/example.png','/assets/seedream-hairstyles/previews/not-built.webp?hair=v1','https://another.invalid/assets/seedream-hairstyles/previews/40.webp'])assert.equal(hairPickerPreview(source),source);
});
test('the existing public cache policy caches every generated thumbnail immutably',()=>{
 for(const thumbnail of Object.values(thumbnails)){
  const headers={};publicAssetHeaders({setHeader:(name,value)=>headers[name]=value},'/app/public'+thumbnail);
  assert.equal(headers['Cache-Control'],'public, max-age=31536000, immutable');
 }
});
