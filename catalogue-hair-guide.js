import {readFile} from 'node:fs/promises';
import path from 'node:path';

export {HAIR_REFERENCE_VERSION} from './catalogue-hair-policy.js';
export async function loadCatalogueHairGuide(id,root){
 if(!/^seedream-\d{2}$/.test(id))throw Error('Invalid catalogue hair reference');
 try{return await readFile(path.join(root,'public/assets/catalogue-hair-guides/v1',id+'.png'))}
 catch{throw Object.assign(Error('โหลดภาพทรงผมที่เลือกไม่สำเร็จ กรุณารีเฟรชแล้วเลือกใหม่'),{code:'hairstyle_reference_unavailable'})}
}
