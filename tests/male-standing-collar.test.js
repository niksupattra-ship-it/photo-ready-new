import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {measureMaleStandingCollar} from '../src/male-standing-collar.js';
import {governmentReferenceLandmarkFit} from '../src/government-insignia-fit.js';
import {governmentResultInsigniaSignature as signature,sameGovernmentResultInsigniaSignature as same} from '../src/government-result-insignia-cache.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function scene({top=380,button=435,shiftX=0,shiftY=0,scale=1,includeButton=true}={}){
 const width=500*scale,height=680*scale,data=new Uint8ClampedArray(width*height*4);
 const pixel=(x,y,c)=>{const i=(y*width+x)*4;data.set([...c,255],i)};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const xx=(x-shiftX)/scale,yy=(y-shiftY)/scale;
  let c=[55,130,235];if(xx>=40&&xx<460&&yy>=360)c=[232,231,245];
  if(xx>=200&&xx<=300&&yy>=230&&yy<top)c=[180,135,110];
  if(includeButton&&Math.hypot(xx-250,yy-button)<=10)c=[224,177,45];
  pixel(x,y,c);
 }
 return {image:{data,width,height},g:{left:30*scale+shiftX,right:470*scale+shiftX,top:360*scale+shiftY,width:440*scale}};
}
test('male standing collar follows its actual fabric edge and top button instead of the shoulder-only offset',()=>{
 for(const top of [370,385])for(const button of [425,445]){
  const {image,g}=scene({top,button}),before=hash(image.data),fit=measureMaleStandingCollar(image,g);assert(fit);
  assert(fit.y>top&&fit.y<button-12);assert(Math.abs(fit.button.y-button)<2);assert(Math.abs((fit.left.x+fit.right.x)/2-250)<2);
  assert(fit.y>g.top+g.width*.028+12,'No pin floating on the upper skin/collar seam');assert.equal(hash(image.data),before);
 }
 const base=scene(),moved=scene({shiftX:8,shiftY:10,scale:2}),a=measureMaleStandingCollar(base.image,base.g),b=measureMaleStandingCollar(moved.image,moved.g);
 assert(Math.abs(b.y-(a.y*2+10))<4);assert(Math.abs(b.left.x-(a.left.x*2+8))<3);
 const empty=scene({includeButton:false});assert.equal(measureMaleStandingCollar(empty.image,empty.g),null);
});
test('actual male reference uses standing collar measurement at native and scene resolutions, without moving chest/ribbon or altering pixels',async()=>{
 const source=await readFile(new URL('../public/assets/government-uniforms/male-government-employee-example.jpg',import.meta.url));
 for(const width of [500,900]){
  const {data,info}=await sharp(source).resize(width,Math.round(width*681/500)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const before=hash(data),fit=governmentReferenceLandmarkFit({data,width:info.width,height:info.height},'male','/assets/government-uniforms/male-government-employee.png');
  assert(fit.measuredStandingCollar);const collarY=fit.frame.y+fit.frame.h*fit.preset.collar.y;
  assert(collarY>Math.min(...Object.values(fit.measuredStandingCollar.top)));assert(collarY<fit.measuredStandingCollar.button.y);
  assert.equal(fit.preset.chest.x,.265);assert.equal(fit.preset.ribbon.x,.737);assert.equal(hash(data),before);
 }
});
test('native buttons/boards participate in measurement cache invalidation, independently of added insignia',()=>{
 const head={id:'head',jobId:'job',kind:'head',source:'photo'},asset={original:{width:900,height:1200}},layer={id:'button',kind:'uniform-detail',hairHeadId:'head',realUniformDetail:true,source:'native-button',x:0,y:0,sourceFrame:{x:440,y:700,w:20,h:20}};
 const input={head,garment:head,asset,gender:'male',details:[{layer,asset:{original:{width:20,height:20}}}]};
 const before=signature(input);assert(same(before,signature(input)));
 assert(!same(before,signature({...input,details:[]})));
 assert(!same(before,signature({...input,details:[{...input.details[0],layer:{...layer,y:12}}]})));
});

test('male breast badges follow the first two buttons at the approved common level across portrait sizes',async()=>{
 for(const file of ['male-operational-example.png','male-government-employee-example.jpg'])for(const width of [500,900]){
  const {data,info}=await sharp(new URL('../public/assets/government-uniforms/'+file,import.meta.url).pathname).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const fit=governmentReferenceLandmarkFit({data,width:info.width,height:info.height},'male','/assets/government-uniforms/male-government-employee.png'),line=fit.measuredChestLine;
  assert(line,file);assert(Math.abs(line.y-(line.first+(line.second-line.first)*.56))<1e-8);
  const {chest,ribbon,collar}=fit.preset;
  assert.equal(chest.y,ribbon.centerY);assert.equal(chest.height,.075);assert.equal(collar.width,.0664);
  assert(Math.abs(fit.frame.y+fit.frame.h*chest.y-line.y)<1e-8);
 }
});
