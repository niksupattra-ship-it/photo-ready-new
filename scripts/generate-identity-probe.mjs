import{readFile,writeFile}from'node:fs/promises';
import path from'node:path';
import{createHash}from'node:crypto';
import sharp from'sharp';
import{processProductionPortrait}from'../production-portrait-pipeline.js';
import{seedreamReviewPayload}from'../seedream-review-transport.js';
import{ENGLISH_TEMPLATE_BODY_FINISH_VERSION}from'../english-template-body-policy.js';
import{ORIGINAL_PORTRAIT_AI_VERSION}from'../original-portrait-ai.js';
import{AI_MAKEUP_PAIR_VERSION}from'../ai-makeup-pair-policy.js';
const QA='https://english-soft-studio-qa-20261111-production.up.railway.app';
let token,expires=0,calls=0;
async function auth(){if(token&&Date.now()<expires)return token;const r=await fetch(process.env.ACTIONS_ID_TOKEN_REQUEST_URL+'&audience=idpromth-identity-layout-qa',{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});if(!r.ok)throw Error('OIDC request failed');token=(await r.json()).value;expires=Date.now()+180000;return token;}
async function requestPortrait(options){if(++calls>2)throw Error('Unexpected additional AI call');const r=await fetch(QA+'/generate',{method:'POST',headers:{Authorization:'Bearer '+await auth(),'Content-Type':'application/json'},body:JSON.stringify(seedreamReviewPayload(options)),signal:AbortSignal.timeout(240000)});if(!r.ok)throw Error('Provider proxy '+r.status+': '+(await r.text()).slice(0,300));return{png:Buffer.from(await r.arrayBuffer())};}
async function matting(png){const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'qa.png');const r=await fetch('https://joyful-upliftment-production.up.railway.app/api/remove-background',{method:'POST',body:form,signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Matting failed');return Buffer.from(await r.arrayBuffer());}
const root=process.cwd(),original=await readFile(path.join(root,'public/assets/job-uniforms/female-formal-suit-example.png')),box=[.3666679859161377,.1652698516845703,.614404559135437,.402640700340271];
const fields={interfaceLanguage:'en',portraitComposition:'en-outfit-body-v1',englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitMode:'female',femaleEyeStyle:'natural',studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,femaleFinishPair:AI_MAKEUP_PAIR_VERSION,hairId:'seedream-41',hairReferenceVersion:'picker-hair-v1',faceIdentityBox:JSON.stringify(box),neckOutfitReferencePath:'/assets/job-uniforms/female-job-ivory-bow-blouse.png'};
let makeup;const natural=await processProductionPortrait({input:{buffer:original,mimetype:'image/png'},fields,root,key:'authenticated-ci-proxy',requestPortrait,removeBackground:matting,onMakeupVariant:async p=>{makeup=p;}});
const a=await sharp(natural).ensureAlpha().extractChannel(3).raw().toBuffer(),b=await sharp(makeup).ensureAlpha().extractChannel(3).raw().toBuffer();if(!a.equals(b)||calls!==2)throw Error('Pair contract failed');
await writeFile('/tmp/identity-natural.png',natural);await writeFile('/tmp/identity-makeup.png',makeup);
const m=await sharp(natural).metadata(),report={width:m.width,height:m.height,providerCalls:calls,sameAlpha:true,naturalSha256:createHash('sha256').update(natural).digest('hex'),makeupSha256:createHash('sha256').update(makeup).digest('hex')};await writeFile('/tmp/identity-native-report.json',JSON.stringify(report));console.log('IDENTITY_NATIVE_PAIR '+JSON.stringify(report));

for (const [name,png] of [['natural',natural],['makeup',makeup]]) {
 const jpeg=await sharp(png).flatten({background:'#fff'}).resize({width:684}).jpeg({quality:84}).toBuffer();
 if(jpeg.length>256*1024)throw Error('Private preview too large');
 const preview=await fetch(QA+'/preview',{method:'POST',headers:{Authorization:'Bearer '+await auth(),'Content-Type':'image/jpeg'},body:jpeg});
 if(!preview.ok)throw Error('Authenticated private preview failed '+preview.status);
 console.log('IDENTITY_PRIVATE_PREVIEW_STORED '+name);
}
