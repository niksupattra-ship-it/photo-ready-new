import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createEnglishBodyLayout,ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE,ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE,ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,ENGLISH_TEMPLATE_PROPORTION_PROFILE} from '../english-body-layout.js';
import {processProductionPortrait,portraitIdentityCrop,validateProductionPortrait} from '../production-portrait-pipeline.js';
import {ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION,englishTemplateBodyFinishForGender,isEnglishTemplateBodyFinish,usesEnglishIdentityLayout} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {AI_MAKEUP_PAIR_VERSION} from '../ai-makeup-pair-policy.js';
const root=new URL('..',import.meta.url).pathname;
const template='/assets/job-uniforms/female-job-ivory-bow-blouse.png';
const box=[.22,.10,.78,.72];
const cutout=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9788'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
const input={buffer:cutout,mimetype:'image/png'};
const fields=(gender,version,pair=false)=>({
 interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',
 englishStudioFinishVersion:version,portraitMode:gender,femaleEyeStyle:'natural',
 ...(gender==='female'?{studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION}:{}),
 ...(pair?{femaleFinishPair:AI_MAKEUP_PAIR_VERSION}:{}),
 neckOutfitReferencePath:template,faceIdentityBox:JSON.stringify(box)
});
const run=async(gender,version,pair=false)=>{
 const calls=[];let storedMakeup=null;
 const output=await processProductionPortrait({
  input,fields:fields(gender,version,pair),root,key:'female-balance-v2',
  removeBackground:async()=>cutout,
  onMakeupVariant:async image=>{storedMakeup=image},
  requestPortrait:async arg=>{calls.push(arg);return {png:cutout}}
 });
 assert.equal(calls.length,pair?2:1,'Only the existing Natural/Makeup generation calls are allowed');
 return {natural:calls[0],makeup:calls[1],storedMakeup,output};
};
const decode=async b=>sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const colorFaceWidth=(result)=>{
 const pixels=result.data,W=result.info.width;
 let l=W,r=-1,count=0;
 for(let i=0;i<pixels.length;i+=4){
  if(Math.abs(pixels[i]-189)>2||Math.abs(pixels[i+1]-151)>2||Math.abs(pixels[i+2]-136)>2||pixels[i+3]<250)continue;
  const x=(i/4)%W;l=Math.min(l,x);r=Math.max(r,x);count++;
 }
 assert(count>1000,'Identity guide must contain real original face pixels');
 return r-l+1;
};
test('new female only: balanced ~39% guide, smaller than older v9 but larger than previous tiny v1',()=>{
 const fresh=ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE;
 const old=ENGLISH_FEMALE_MATCHED_PROPORTION_PROFILE;
 assert.deepEqual(old,ENGLISH_MALE_TEMPLATE_PROPORTION_PROFILE,'Previous v1 and current male remain identical');
 assert.equal(fresh.identityHeadScale,.95);
 assert.equal(fresh.headWidthToShoulder,.41);
 assert.equal(fresh.headHeightToShoulder,.55,'Reserve the same framing as male v1; do not shrink the jacket');
 assert.equal(fresh.chinToCollar,.020,'Keep the same short upper-collar anchor as the unchanged male and v1 guide');
 assert.equal(fresh.neckToShoulder,.255);
 assert.equal(fresh.chestToShoulder,.46);
 const width=fresh.identityHeadScale*fresh.headWidthToShoulder;
 assert(width>.38&&width<.40,'Larger balanced female head should be ~39% of shoulder span');
 assert(width>old.identityHeadScale*old.headWidthToShoulder*1.20);
 assert(width<ENGLISH_TEMPLATE_PROPORTION_PROFILE.identityHeadScale*ENGLISH_TEMPLATE_PROPORTION_PROFILE.headWidthToShoulder);
 assert.equal(englishTemplateBodyFinishForGender('female'),ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION);
 assert.equal(englishTemplateBodyFinishForGender('male'),ENGLISH_TEMPLATE_BODY_FINISH_VERSION);
 for(const version of [ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION]){
  assert(isEnglishTemplateBodyFinish(version));
  assert(usesEnglishIdentityLayout(fields('female',version)));
  assert.doesNotThrow(()=>validateProductionPortrait(input,fields('female',version)));
 }
 assert.throws(()=>validateProductionPortrait(input,{...fields('female',ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION),interfaceLanguage:'th'}),/English studio|English outfit|Invalid/);
});
test('real AI request gets bigger female face without resizing the original native suit or altering men',async()=>{
 const female=await run('female',ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION);
 const previousFemale=await run('female',ENGLISH_FEMALE_MATCHED_PROPORTION_VERSION);
 const male=await run('male',ENGLISH_TEMPLATE_BODY_FINISH_VERSION);
 assert.deepEqual(previousFemale.natural.portrait,male.natural.portrait,'Preserve the former male-matched female v1 guide');
 assert.notDeepEqual(female.natural.portrait,male.natural.portrait,'v2 female must actually be larger');
 assert.deepEqual(female.natural.outfit,previousFemale.natural.outfit);
 assert.deepEqual(female.natural.outfit,male.natural.outfit,'Never change the native clothing input');
 assert.equal(female.natural.size,male.natural.size);
 const original=await sharp(await readFile(root+'public'+template)).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
 const identity=await portraitIdentityCrop(input,box);
 const expected=await createEnglishBodyLayout(original,{headScale:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE.identityHeadScale,identity,canvasWidth:1824,profile:ENGLISH_FEMALE_BALANCED_PROPORTION_PROFILE});
 assert.deepEqual(female.natural.portrait,expected,'The actual AI Image 1 must contain the v2 head at its new scale');
 const oldPixels=await decode(previousFemale.natural.portrait),newPixels=await decode(female.natural.portrait);
 assert.equal(newPixels.info.width,1824);
 assert.equal(newPixels.info.height,2432);
 const ratio=colorFaceWidth(newPixels)/colorFaceWidth(oldPixels);
 assert(ratio>1.18&&ratio<1.4,'Female face grows naturally about 20–30%, without zooming or warping');
 // The native suit must not shrink or move below the neckline.
 const start=Math.floor(newPixels.info.height*.70)*newPixels.info.width*4;
 assert.deepEqual(newPixels.data.subarray(start),oldPixels.data.subarray(start),'The lower 30% of the same suit must retain exactly the same image pixels');
 assert.match(female.natural.prompt,/FEMALE V2 — BALANCED HEAD\/BODY/);
 assert.match(female.natural.prompt,/38–40%/);
 assert.doesNotMatch(female.natural.prompt,/30–32%|MALE BODY BALANCE|FINAL ENGLISH MALE SHORT-HAIR/);
 assert.match(female.natural.prompt,/SELECTED hairstyle|selected hairstyle/i);
 assert.match(female.natural.prompt,/Keep the garment at EXACTLY this template size/);
 assert.match(male.natural.prompt,/MALE BODY BALANCE/);
 assert.match(previousFemale.natural.prompt,/30–32%/);
});
test('new English female still saves Natural and Makeup as one paid pair',async()=>{
 const pair=await run('female',ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION,true);
 assert(pair.output?.length&&pair.storedMakeup?.length);
 assert.equal((await sharp(pair.output).metadata()).width,(await sharp(pair.storedMakeup).metadata()).width);
 assert.match(pair.makeup.prompt,/identical width, height, scale|exactly the same canvas coordinates/i);
});
test('client submits v2 only for new female jobs; recovered old purchased jobs retain their server version',async()=>{
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
 assert.match(main,/fd\.append\('englishStudioFinishVersion',englishTemplateBodyFinishForGender\(portraitMode\)\)/);
 assert.match(main,/if\(j\.englishStudioFinishVersion\)natural\.idpromEnglishStudioFinishVersion=j\.englishStudioFinishVersion/);
 assert.match(main,/!result\.idpromEnglishStudioFinishVersion/);
 assert.match(main,/ENGLISH_FEMALE_BALANCED_PROPORTION_VERSION\)\?ENGLISH_TEMPLATE_BODY_FRAMING_VERSION/);
 assert.match(editor,/existing\.englishStudioFinishVersion===englishTemplateBodyFinishForGender\(gender\)/);
});
