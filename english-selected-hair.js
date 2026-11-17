import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import boundaries from './english-hair-boundaries.json' with {type:'json'};
export {selectedHairBoundaryInstruction as englishSelectedHairBoundaryInstruction} from './hair-neck-boundary.js';

// The photographic picker includes the neck-side absence of hair. The earlier
// isolated cutout alone did not show that context, particularly for 66–78.
// Retain both pieces of evidence in the SAME reference slot / generation.
export async function englishSelectedHairReference({selected,hair,root}){
 const entry=boundaries[selected?.id];
 if(selected?.interfaceLanguage!=='en'||!hair)return hair;
 if(!entry)throw Error('Selected hairstyle boundary reference is unavailable. Please refresh and try again.');
 const preview=await readFile(path.join(root,'public',entry.preview.slice(1)));
 if(createHash('sha256').update(preview).digest('hex')!==entry.previewSha256)throw Error('Hairstyle boundary reference changed. Please refresh and try again.');
 const {width,height}=await sharp(preview).metadata();
 const xs=entry.faceOval.map(p=>p.x*width),ys=entry.faceOval.map(p=>p.y*height),pad=width*.02;
 const faceMask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${Math.min(...xs)-pad}" y="${Math.min(...ys)-pad}" width="${Math.max(...xs)-Math.min(...xs)+pad*2}" height="${Math.max(...ys)-Math.min(...ys)+pad*2}" fill="#bdc3cb"/></svg>`);
 const context=await sharp(preview).composite([{input:faceMask}]).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).png().toBuffer();
 const design=await sharp(hair).flatten({background:'#356bd8'}).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).png().toBuffer();
 const [d,c]=await Promise.all([sharp(design).metadata(),sharp(context).metadata()]);
 const labels=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><g fill="white" font-family="sans-serif" font-size="17"><text x="32" y="27">EXACT SELECTED HAIR</text><text x="544" y="27">SELECTED LENGTH / NECK BOUNDARY</text></g></svg>');
 const board=await sharp({create:{width:1024,height:768,channels:3,background:'#356bd8'}}).composite([
  {input:design,left:Math.round((512-d.width)/2),top:48},
  {input:context,left:512+Math.round((512-c.width)/2),top:48},
  {input:labels,left:0,top:0}
 ]).png().toBuffer();
 return sharp(board).removeAlpha().png().toBuffer();
}
