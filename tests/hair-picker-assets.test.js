import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {FREE_FEMALE_HAIR_OPTIONS} from '../src/free-female-hair.js';
import {HAIR_PICKER_SOURCES,buildHairPickerThumbnails} from '../scripts/build-hair-picker-thumbnails.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),publicDir=path.join(root,'public');
const manifest=JSON.parse(await readFile(new URL('../src/hair-picker-thumbnails.json',import.meta.url),'utf8'));
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const originals=[...new Set([
 ...HAIR_PICKER_SOURCES,
 ...(await readdir(path.join(publicDir,'assets/seedream-hairstyles/references'))).filter(file=>/\.(png|webp|jpe?g)$/.test(file)).map(file=>'/assets/seedream-hairstyles/references/'+file),
 ...FREE_FEMALE_HAIR_OPTIONS.map(item=>'/assets/hair/'+item.id+'.png')
])].sort();
const before=new Map();for(const src of originals)before.set(src,digest(await readFile(path.join(publicDir,src.slice(1)))));
const temp=await mkdtemp(path.join(tmpdir(),'hair-picker-assets-'));
after(()=>rm(temp,{recursive:true,force:true}));

test('every Thai, English and free hair has one deterministic display-only thumbnail mapping',()=>{
 assert.deepEqual(Object.keys(manifest),HAIR_PICKER_SOURCES);
 assert.equal(new Set(Object.values(manifest)).size,HAIR_PICKER_SOURCES.length);
 for(const item of [...PRODUCTION_HAIR_CATALOG,...FREE_FEMALE_HAIR_OPTIONS])assert(manifest[item.src],item.id+' missing');
});

test('content-addressed WebP tiles fit inside 192px and preserve the full original composition and alpha',async()=>{
 let sourceBytes=0,thumbnailBytes=0;
 for(const src of HAIR_PICKER_SOURCES){
  const url=manifest[src],input=await readFile(path.join(publicDir,src.slice(1))),output=await readFile(path.join(publicDir,url.slice(1)));
  assert.match(url,/^\/assets\/hair-picker-thumbnails\/[a-zA-Z0-9_-]+\.[a-f0-9]{12}\.webp$/);
  assert(url.endsWith('.'+digest(output).slice(0,12)+'.webp'),'URL hash matches encoded bytes');
  assert(output.length<20_000,'A picker tile must remain small: '+src);
  const im=await sharp(input).metadata(),thumb=await sharp(output).metadata(),scale=Math.min(1,192/im.width,192/im.height);
  assert.equal(thumb.format,'webp');assert(thumb.width<=192&&thumb.height<=192);
  assert(Math.abs(thumb.width-im.width*scale)<=1&&Math.abs(thumb.height-im.height*scale)<=1,'Full aspect ratio must survive: '+src);
  if(im.hasAlpha)assert.equal(thumb.hasAlpha,true);
  // Compare the entire normalized composition, including outer hair lengths,
  // against the selected preview. A centre-cropped tile fails this check.
  const expected=await sharp(input).rotate().resize(thumb.width,thumb.height,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  const actual=await sharp(output).ensureAlpha().raw().toBuffer();let difference=0;
  assert.equal(actual.length,expected.length);
  // RGB beneath fully transparent pixels is unspecified by lossy WebP.
  for(let i=0;i<actual.length;i+=4){for(let channel=0;channel<3;channel++)difference+=Math.abs(actual[i+channel]*actual[i+3]/255-expected[i+channel]*expected[i+3]/255);difference+=Math.abs(actual[i+3]-expected[i+3]);}
  assert(difference/actual.length<8,'Picker composition differs from source: '+src);
  sourceBytes+=input.length;thumbnailBytes+=output.length;
 }
 assert(thumbnailBytes<sourceBytes*.25,'Thumbnail payload must be meaningfully smaller');
});

test('regeneration is deterministic and leaves every preview, native overlay and AI reference byte unchanged',async()=>{
 const manifestFile=path.join(temp,'manifest.json'),outputDir=path.join(temp,'tiles');
 const stats=await buildHairPickerThumbnails({publicDir,outputDir,manifestFile});
 assert.equal(stats.count,HAIR_PICKER_SOURCES.length);assert.deepEqual(JSON.parse(await readFile(manifestFile,'utf8')),manifest);
 for(const url of Object.values(manifest))assert.deepEqual(await readFile(path.join(outputDir,path.basename(url))),await readFile(path.join(publicDir,url.slice(1))));
 for(const src of originals)assert.equal(digest(await readFile(path.join(publicDir,src.slice(1)))),before.get(src),'Native/source file was modified: '+src);
});
