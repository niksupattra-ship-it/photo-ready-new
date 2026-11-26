import sharp from 'sharp';
import {femaleFaceCropGeometry} from './female-preplaced-face-contract.js';
export async function prepareFemaleFace(input,evidence){
 const g=femaleFaceCropGeometry(evidence);
 const {data:source,info}=await sharp(input,{limitInputPixels:33554432}).rotate().png().toBuffer({resolveWithObject:true});
 if(info.width!==g.sourceWidth||info.height!==g.sourceHeight)throw Error('จุดใบหน้าไม่ตรงกับรูปต้นฉบับ กรุณาอัปโหลดใหม่');
 const points=g.polygon.map(p=>`${(p.x-g.minX)*g.q+3},${(p.y-g.minY)*g.q+3}`).join(' ');
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${g.width}" height="${g.height}"><defs><filter id="feather"><feGaussianBlur stdDeviation="0.7"/></filter><mask id="face"><polygon points="${points}" fill="white" filter="url(#feather)"/></mask></defs><g mask="url(#face)"><image x="${-g.mid.x}" y="${-g.mid.y}" width="${info.width}" height="${info.height}" transform="translate(${3-g.minX*g.q} ${3-g.minY*g.q}) scale(${g.q}) rotate(${-g.angle*180/Math.PI})" xlink:href="data:image/png;base64,${source.toString('base64')}"/></g></svg>`);
 return sharp(svg).png().toBuffer();
}
