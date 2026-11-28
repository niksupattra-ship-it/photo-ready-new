import sharp from 'sharp';
import {FEMALE_FACE_OUTLINE,parseFemaleFaceEvidence} from './female-preplaced-face-contract.js';

// Independent source-face detail, never a crop from the tiny guide or an AI result.
// Preserve native pixels for ordinary uploads; only very large crops are reduced.
export async function prepareGuideEditIdentity(input,evidence){
 const v=parseFemaleFaceEvidence(evidence),source=sharp(input,{limitInputPixels:33554432});
 const meta=await source.metadata();
 if(!['png','jpeg','webp'].includes(meta.format))throw Error('Unsupported original portrait');
 const {data,info}=await source.rotate().png().toBuffer({resolveWithObject:true});
 if(info.width!==v.width||info.height!==v.height)throw Error('จุดใบหน้าไม่ตรงกับรูปต้นฉบับ กรุณาอัปโหลดใหม่');
 const points=FEMALE_FACE_OUTLINE.map(id=>({x:v.points[id].x*v.width,y:v.points[id].y*v.height}));
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const left=Math.max(0,Math.floor(minX-(maxX-minX)*.1)),top=Math.max(0,Math.floor(minY-(maxY-minY)*.08));
 const right=Math.min(info.width,Math.ceil(maxX+(maxX-minX)*.1)),bottom=Math.min(info.height,Math.ceil(maxY+(maxY-minY)*.08));
 return sharp(data).extract({left,top,width:right-left,height:bottom-top}).flatten({background:'#ffffff'})
  .resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
