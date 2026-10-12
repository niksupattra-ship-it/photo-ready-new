import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const server=fs.readFileSync(new URL('./server.js',import.meta.url),'utf8'),client=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
const flag=server.match(/const newPortraitHair=([^;]+);/)[1],start=server.indexOf('    // The explicit male first-portrait choice changes hair only.'),end=server.indexOf('    if(!creditUse)',start),rule=server.slice(start,end);
function finish({portraitMode,hairId='original',inpaint=false,hairDonor=false}={}){
 const cleanHead=hairId==='clean-head',keepOriginalHair=hairId==='original'||cleanHead,context={req:{body:{portraitMode}},portraitMode,inpaint,hairDonor,cleanHead,keepOriginalHair,seedreamPrompt:'EXISTING FACE / SKIN / NECK / LIGHT / CLOTHING INSTRUCTIONS'};
 return vm.runInNewContext('const newPortraitHair='+flag+';\n'+rule+'\nseedreamPrompt',context);
}
test('explicit male first portrait receives neat short hair with a full uncovered forehead in the same request',()=>{
 const prompt=finish({portraitMode:'male'});assert.match(prompt,/tidy natural SHORT haircut/);assert.match(prompt,/ENTIRE forehead remains uncovered down to both eyebrows/);assert.match(prompt,/above and behind both ears/);assert.match(prompt,/short back hair clear of the neck/);assert.match(prompt,/No bangs, diagonal fringe/);assert.match(prompt,/do not enlarge the head or raise the hairline/);
});
test('male haircut rule preserves face, existing skin and neck preparation without additional cosmetic edits or skin patches',()=>{
 const prompt=finish({portraitMode:'male'});assert.match(prompt,/head position, asymmetry, eyebrows, eyes, nose, lips, expression, ears/);assert.match(prompt,/all already visible forehead skin unchanged/);assert.match(prompt,/existing skin tone, fine texture, pores, marks and established skin finish/);assert.match(prompt,/neck shape, width, length, skin detail and complete neck\/clavicle fitting preparation exactly/);assert.match(prompt,/does not authorize any additional face regeneration/);assert.match(prompt,/Never paste a reference face, paint a skin-colored border or add a forehead skin strip/);assert.match(prompt,/every non-hair instruction unchanged/);
});
for(const portraitMode of ['female',undefined,'',null,'unknown'])test(`other portrait choice ${String(portraitMode)} keeps the exact existing prompt`,()=>{assert.equal(finish({portraitMode}),'EXISTING FACE / SKIN / NECK / LIGHT / CLOTHING INSTRUCTIONS')});
for(const options of [{hairId:'manhair-01'},{hairId:'hair-01'},{hairId:'clean-head'},{inpaint:true},{hairDonor:true}])test(`male preference does not change another edit route ${JSON.stringify(options)}`,()=>{assert.equal(finish({portraitMode:'male',...options}),'EXISTING FACE / SKIN / NECK / LIGHT / CLOTHING INSTRUCTIONS')});
const keyLine=client.slice(client.indexOf(' const key=JSON.stringify(',client.indexOf('async function aiFinishPortrait(')),client.indexOf('\n const cached=',client.indexOf('async function aiFinishPortrait(')));
const key=(portraitMode,hairId)=>vm.runInNewContext(keyLine+'\nkey',{JSON,scope:'account',digest:'image-digest',neckline:{width:.3,depth:.2},hairId,options:{portraitMode}});
test('male first portrait cache invalidates old grooming results while all other keys stay unchanged',()=>{
 for(const hairId of ['',undefined,'original','manhair-01','hair-01'])for(const portraitMode of ['male','female',undefined,'unknown']){
  const current=JSON.parse(key(portraitMode,hairId)),previous=['measured-forehead-hairline-root-v2','account','image-digest',hairId||'original',{width:.3,depth:.2},...(['female','male'].includes(portraitMode)?[portraitMode,'complete-new-hair-open-forehead-no-ear-tails-v12']:[])];
  if(portraitMode==='male'&&(!hairId||hairId==='original')){assert.notDeepEqual(current,previous);assert.equal(current.at(-1),'male-short-open-forehead-face-skin-neck-locked-v13');assert.deepEqual(current.slice(0,-1),previous.slice(0,-1))}else assert.deepEqual(current,previous);
 }
});
test('both frontend entry files carry the same narrowly scoped cache change',()=>{assert.equal(fs.readFileSync(new URL('./main.jsx',import.meta.url),'utf8'),client)});
