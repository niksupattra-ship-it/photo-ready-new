import {downloadPhotoRect} from '../src/download-photo-crop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {letterPhotoLayout,letterPhotoPdf} from '../src/letter-photo-pdf.js';
test('Letter grid keeps exact physical photo dimensions, margins and count limits',()=>{
 for(const [w,h] of [[35,45],[50.8,50.8],[33,48],[50,70],[25,33],[30,40],[40,53],[48,63],[62,78],[51,51]]){
  const layout=letterPhotoLayout(w,h,999);
  assert.equal(layout.count,layout.capacity);
  for(const p of layout.positions){assert(Math.abs(p.width*25.4/72-w)<1e-10);assert(Math.abs(p.height*25.4/72-h)<1e-10);assert(p.x>=18&&p.y>=18);assert(p.x+p.width<=594);assert(p.y+p.height<=774)}
 }
 assert.equal(letterPhotoLayout(50.8,50.8,4).count,4);
 assert.throws(()=>letterPhotoLayout(300,500));
});
test('PDF opens as one real Letter page with a valid embedded JPEG and accurate 2-inch transforms',async()=>{
 const dir=await mkdtemp(tmpdir()+'/letter-photo-');
 try{
  const jpeg=await sharp({create:{width:600,height:600,channels:3,background:'#345678'}}).jpeg().toBuffer();
  const pdf=letterPhotoPdf(jpeg,600,600,letterPhotoLayout(50.8,50.8,4));
  assert.equal(pdf.type,'application/pdf');const bytes=Buffer.from(await pdf.arrayBuffer());assert(bytes.includes(Buffer.from('q 144 0 0 144')));
  const path=dir+'/sheet.pdf';await writeFile(path,bytes);
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});assert.match(info,/Pages:\s+1/);assert.match(info,/Page size:\s+612 x 792 pts/);
  execFileSync('pdftoppm',['-singlefile','-scale-to','792','-png',path,dir+'/preview']);
  const meta=await sharp(dir+'/preview.png').metadata();assert.equal(meta.width,612);assert.equal(meta.height,792);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('PNG can move at 100% and shrink without the old crop-boundary clamp',()=>{
 const size={width:50,height:70};
 const center=downloadPhotoRect(900,1200,size,{x:.5,y:.5,zoom:1});
 const moved=downloadPhotoRect(900,1200,size,{x:.4,y:.4,zoom:1});
 assert(Math.abs(center.x-moved.x-90)<1e-10);assert.equal(center.y-moved.y,120);assert(moved.x<0);
 const smaller=downloadPhotoRect(900,1200,size,{x:.5,y:.5,zoom:.5});assert.equal(smaller.width,center.width*2);
});
