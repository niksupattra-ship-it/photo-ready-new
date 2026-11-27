import test from 'node:test';
import assert from 'node:assert/strict';
import {clearLapelPins,refineLapelCollarFit} from '../src/lapel-pin-clearance.js';
function sample(scale=1){
 const width=500*scale,height=600*scale,data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<data.length;i+=4)data.set([238,235,245,255],i);
 const frame={x:0,y:200*scale,w:500*scale,h:400*scale},collar={left:.30,right:.70,y:.12,width:.05};
 // Pale narrow seams intersect the outer edge of each full badge footprint,
 // leaving the exact centre pixels white (the reported failure).
 for(let y=215*scale;y<285*scale;y++)for(const center of [164,336])for(let x=center*scale;x<(center+2)*scale;x++)data.set([201,199,210,255],(y*width+x)*4);
 return {image:{width,height,data},frame,collar};
}
test('both complete female collar badges clear pale seams despite white centres, remain level, immutable and scale invariant',()=>{
 let base;
 for(const scale of [1,2]){
  const {image,frame,collar}=sample(scale),before=image.data.slice();
  const result=clearLapelPins(image,frame,collar);assert.equal(result.clear,true);
  assert.notEqual(result.collar.left,collar.left);
  assert.notEqual(result.collar.right,collar.right);
  const c=result.collar,cy=frame.y+c.y*frame.h,radius=frame.w*c.width*.72;
  for(const [x,seam]of [[c.left*frame.w,164*scale],[c.right*frame.w,336*scale]])assert(x+radius<seam-2*scale||x-radius>seam+4*scale||cy-frame.w*c.width*.90>285*scale);
  assert.deepEqual(image.data,before);assert.deepEqual(collar,{left:.30,right:.70,y:.12,width:.05});
  if(base){assert(Math.abs(c.left-base.left)<.006);assert(Math.abs(c.right-base.right)<.006);assert(Math.abs(c.y-base.y)<.006)}else base=c;
 }
});
test('clear flat fabric preserves existing coordinates and uncertain fabric stays reviewable without invented relocation',()=>{
 const {image,frame,collar}=sample();image.data.fill(255);
 assert.deepEqual(clearLapelPins(image,frame,collar),{collar,clear:true});
 image.data.fill(0);assert.deepEqual(clearLapelPins(image,frame,collar),{collar,clear:false});
});
test('left badge rejects a faint seam across its outer footprint while the already-clear right badge stays put',()=>{
 const {image,frame,collar}=sample();image.data.fill(255);
 for(let y=215;y<285;y++)for(let x=168;x<171;x++)image.data.set([247,247,247,255],(y*image.width+x)*4);
 const before=image.data.slice(),r=clearLapelPins(image,frame,collar);assert(r.clear);assert.notEqual(r.collar.left,collar.left);assert.equal(r.collar.right,collar.right);assert.equal(r.collar.y,collar.y);assert.deepEqual(image.data,before);
});

test('finished lapel pins shrink 2%, clear a pale lower edge and leave chest/ribbon placements unchanged',()=>{
 const {image,frame,collar}=sample();image.data.fill(255);
 for(let y=267;y<270;y++)for(let x=100;x<400;x++)image.data.set([247,247,247,255],(y*image.width+x)*4);
 const chest={x:.25,y:.5,width:.07},ribbon={x:.75,top:.5,width:.2};
 const fit={frame,preset:{collar,chest,ribbon},collarType:'lapel',needsReview:false},before=image.data.slice();
 const result=refineLapelCollarFit(image,fit),c=result.preset.collar;
 assert.equal(c.width,collar.width*.98);assert(c.y<collar.y);assert.equal(result.needsReview,false);
 assert(frame.y+c.y*frame.h+frame.w*c.width*1.22<267,'Complete pin and clearance stay above the lower seam');
 assert.equal(result.preset.chest,chest);assert.equal(result.preset.ribbon,ribbon);assert.deepEqual(image.data,before);
 assert.equal(refineLapelCollarFit(image,{...fit,collarType:'stand'}).preset,fit.preset);
});
