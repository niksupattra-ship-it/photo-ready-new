import sharp from 'sharp';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {selectedHairDesign} from './hairstyle-catalog.js';
import {HAIR_REFERENCE_VERSION} from './catalogue-hair-policy.js';

const manifests=new Map();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const unavailable=()=>Object.assign(Error('Selected compact hairstyle context is unavailable. Please refresh and choose the hairstyle again.'),{code:'hairstyle_boundary_reference_unavailable'});
async function catalogueManifest(root){
 const filename=path.join(root,'public/assets/catalogue-hair-guides/v1/manifest.json');
 if(!manifests.has(filename))manifests.set(filename,readFile(filename,'utf8').then(JSON.parse).catch(error=>{manifests.delete(filename);throw error}));
 return manifests.get(filename);
}

export const THAI_COMPACT_HAIR_REFERENCE_CONTEXT='SELECTED COMPACT HAIR / NEGATIVE-SPACE BOARD — IMAGE 2: LEFT is the complete exact isolated hairstyle. RIGHT is the same selected picker photograph with donor facial features blanked, showing the absence of hair below the ears and beside the neck. These are two views of ONE selected hairstyle, never two people or hairstyles to generate. The LEFT panel retains every intended strand and the full chosen crown/fringe/braid shape. In the RIGHT panel, clean skin/background below the ears and next to the neck means NO HAIR, not unfinished hair to complete. Never add a second dark under-ear layer, rear curtain or neck-side columns. Copy neither donor face/ears/neck/skin, reference clothing, grey face patch, blue board nor labels; retain the uploaded person and the selected outfit. The board is a generation reference only, never output pixels or a postprocessing mask.';

// Thai isolated short/updo guides show the crown accurately but not the clean
// neck beside it. Add the matching photographic context to the SAME reference
// slot. Native guides and previews stay untouched; no result pixels are edited.
export async function thaiCompactHairReference({selected,hair,root}){
 if(!hair||selected?.interfaceLanguage==='en'||typeof selected?.id!=='string'||!selected.id.startsWith('seedream-')||!['short','gathered'].includes(selectedHairDesign(selected)?.kind))return hair;
 if(!/^seedream-\d{2}$/.test(selected?.id||''))throw unavailable();
 const manifest=await catalogueManifest(root),entry=manifest.entries?.[selected.id];
 if(manifest.version!==HAIR_REFERENCE_VERSION||!entry||entry.preview!==selected.src||!/^\/assets\/[A-Za-z0-9_./-]+$/.test(entry.preview)||entry.preview.split('/').includes('..')||digest(hair)!==entry.guideSha256)throw unavailable();
 const preview=await readFile(path.join(root,'public',entry.preview.slice(1)));
 if(digest(preview)!==entry.previewSha256)throw unavailable();
 const [{width,height},{width:hairWidth,height:hairHeight,hasAlpha}]=await Promise.all([sharp(preview).metadata(),sharp(hair).metadata()]);
 if(width!==entry.width||height!==entry.height||hairWidth!==width||hairHeight!==height||!hasAlpha)throw unavailable();
 const face=entry.face,points=Object.values(face||{});
 if(![10,152,234,454,33,263,61,291].every(id=>face?.[id])||!points.length||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))throw unavailable();
 const xs=points.map(p=>p.x*width),ys=points.map(p=>p.y*height),pad=width*.02;
 const rect={x:Math.max(0,Math.min(...xs)-pad),y:Math.max(0,Math.min(...ys)-pad),right:Math.min(width,Math.max(...xs)+pad),bottom:Math.min(height,Math.max(...ys)+pad)};
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${rect.x}" y="${rect.y}" width="${rect.right-rect.x}" height="${rect.bottom-rect.y}" fill="#bdc3cb"/></svg>`);
 // Protect reference hair where its temples overlap the face rectangle. Only
 // donor facial features are neutralized; the full isolated hair is also kept
 // independently and untrimmed in the authoritative left panel.
 const featureMask=await sharp(svg).png().composite([{input:hair,blend:'dest-out'}]).toBuffer();
 const neutralContext=await sharp(preview).composite([{input:featureMask}]).png().toBuffer();
 const [design,context]=await Promise.all([
  sharp(hair).flatten({background:'#356bd8'}).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).removeAlpha().png().toBuffer(),
  sharp(neutralContext).resize({width:480,height:704,fit:'inside',withoutEnlargement:false}).removeAlpha().png().toBuffer()
 ]);
 const [d,c]=await Promise.all([sharp(design).metadata(),sharp(context).metadata()]);
 const labels=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><g fill="white" font-family="sans-serif" font-size="17"><text x="32" y="27">EXACT SELECTED HAIR</text><text x="544" y="27">CLEAN UNDER-EAR / NECK SPACE</text></g></svg>');
 return sharp({create:{width:1024,height:768,channels:3,background:'#356bd8'}}).composite([
  {input:design,left:Math.round((512-d.width)/2),top:48},
  {input:context,left:512+Math.round((512-c.width)/2),top:48},
  {input:labels,left:0,top:0}
 ]).removeAlpha().png().toBuffer();
}
