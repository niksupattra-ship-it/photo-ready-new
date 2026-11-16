import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

// Tiny public backgrounds are embedded in the menu bundle. The original URLs
// remain the only sources passed to selection, composition and export.
export const BACKGROUND_PICKER_SOURCES=['/assets/background.jpg',...['light-blue','deep-blue','white','periwinkle'].map(name=>'/assets/background-options/'+name+'.jpg')];
export async function buildBackgroundPickerPreviews(){
 const previews={};let originalBytes=0,previewBytes=0;
 for(const source of BACKGROUND_PICKER_SOURCES){
  const original=await readFile(new URL('../public'+source,import.meta.url));
  const preview=await sharp(original).resize({width:160,height:160,fit:'inside',withoutEnlargement:true}).webp({quality:78,effort:5}).toBuffer();
  previews[source]='data:image/webp;base64,'+preview.toString('base64');
  originalBytes+=original.length;previewBytes+=preview.length;
 }
 await writeFile(new URL('../src/background-picker-previews.json',import.meta.url),JSON.stringify(previews,null,2)+'\n');
 return {count:BACKGROUND_PICKER_SOURCES.length,originalBytes,previewBytes};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])console.log('Built inline background picker previews: '+JSON.stringify(await buildBackgroundPickerPreviews()));
