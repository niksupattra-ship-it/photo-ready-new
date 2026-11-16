import crypto from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {PRODUCTION_HAIR_CATALOG} from '../hairstyle-catalog.js';
import {FREE_FEMALE_HAIR_OPTIONS} from '../src/free-female-hair.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export const HAIR_PICKER_SOURCES=[...new Set([...PRODUCTION_HAIR_CATALOG,...FREE_FEMALE_HAIR_OPTIONS].map(item=>item.src))].sort();

// Display tiles only. Native overlays and AI reference files never enter the
// output paths, and the full preview composition is preserved without a crop.
export async function buildHairPickerThumbnails({publicDir=path.join(root,'public'),outputDir=path.join(publicDir,'assets/hair-picker-thumbnails'),manifestFile=path.join(root,'src/hair-picker-thumbnails.json')}={}){
 await mkdir(outputDir,{recursive:true});
 const manifest={};let sourceBytes=0,thumbnailBytes=0;
 for(const src of HAIR_PICKER_SOURCES){
  if(!/^\/assets\/[A-Za-z0-9_./-]+$/.test(src)||src.split('/').includes('..'))throw Error('Invalid local hair preview path: '+src);
  const input=await readFile(path.join(publicDir,src.slice(1)));
  const thumbnail=await sharp(input).rotate().resize({width:192,height:192,fit:'inside',withoutEnlargement:true}).webp({quality:84,alphaQuality:100,effort:5}).toBuffer();
  const hash=crypto.createHash('sha256').update(thumbnail).digest('hex').slice(0,12);
  const label=src.replace(/^\/assets\//,'').replace(/\.[^.]+$/,'').replaceAll('/','--');
  const filename=label+'.'+hash+'.webp';
  await writeFile(path.join(outputDir,filename),thumbnail);
  manifest[src]='/assets/hair-picker-thumbnails/'+filename;
  sourceBytes+=input.length;thumbnailBytes+=thumbnail.length;
 }
 await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
 return {count:HAIR_PICKER_SOURCES.length,sourceBytes,thumbnailBytes,reductionPercent:Number((100-thumbnailBytes/sourceBytes*100).toFixed(2))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const stats=await buildHairPickerThumbnails();
 console.log('Created '+stats.count+' display-only 192px hair picker thumbnails: '+JSON.stringify(stats)+'. Native overlays and AI references unchanged.');
}
