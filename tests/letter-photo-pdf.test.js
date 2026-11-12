import {downloadPhotoRect} from '../src/download-photo-crop.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {letterPhotoLayout,a4PhotoLayout,letterPhotoPdf,A4_PAGE} from '../src/letter-photo-pdf.js';
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

test('Thai A4 print sheet has an exact 210 × 297 mm MediaBox and full-size photo positions',async()=>{
 const layout=a4PhotoLayout(35,45,999);
 assert(Math.abs(A4_PAGE.width*25.4/72-210)<1e-10);
 assert(Math.abs(A4_PAGE.height*25.4/72-297)<1e-10);
 assert.equal(layout.count,layout.capacity);
 for(const p of layout.positions){
  assert(Math.abs(p.width*25.4/72-35)<1e-9);
  assert(Math.abs(p.height*25.4/72-45)<1e-9);
  assert(p.x>=18&&p.y>=18&&p.x+p.width<=layout.width-18+1e-8&&p.y+p.height<=layout.height-18+1e-8);
 }
 const dir=await mkdtemp(tmpdir()+'/thai-a4-photo-');
 try{
  const jpeg=await sharp({create:{width:420,height:540,channels:3,background:'#d6c0ae'}}).jpeg().toBuffer();
  const bytes=Buffer.from(await letterPhotoPdf(jpeg,420,540,layout).arrayBuffer());
  const path=dir+'/thai-a4.pdf';await writeFile(path,bytes);
  const info=execFileSync('pdfinfo',[path],{encoding:'utf8'});
  assert.match(info,/Pages:\s+1/);
  assert.match(info,/Page size:\s+595\.27\d+ x 841\.89\d+ pts \(A4\)/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
