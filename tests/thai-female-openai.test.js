import {normalizeOpenAIPhotographicFinish,OPENAI_CRISP_MAKEUP_POLICY} from '../openai-photographic-finish.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {portraitProviderFor,isThaiFemalePortrait} from '../portrait-provider-policy.js';
import {requestOpenAIPortrait,openaiPortraitPayload,OPENAI_PORTRAIT_MODEL,OPENAI_RESPONSES_MODEL,OPENAI_PORTRAIT_ENDPOINT,OPENAI_SKIN_DETAIL_INSTRUCTION,openaiPhotographicInstruction,OPENAI_FULL_FRAME_INSTRUCTION,OPENAI_MAKEUP_DETAIL_INSTRUCTION} from '../openai-portrait-transport.js';
import {requestReviewSeedream,seedreamReviewPayload} from '../seedream-review-transport.js';
import {processProductionPortrait} from '../production-portrait-pipeline.js';
import {THAI_BODY_GEOMETRY_VERSION} from '../thai-body-geometry-policy.js';
import {THAI_OUTFIT_APPEARANCE_VERSION} from '../thai-outfit-ai-policy.js';
import {THAI_REAL_FACE_VERSION} from '../thai-real-face-policy.js';
import {THAI_COLLARLESS_VERSION} from '../thai-collarless-version.js';
import {ENGLISH_OUTFIT_FIDELITY_VERSION} from '../english-outfit-fidelity-version.js';
import {ENGLISH_TEMPLATE_BODY_FINISH_VERSION} from '../english-template-body-policy.js';
import {ORIGINAL_PORTRAIT_AI_VERSION} from '../original-portrait-ai.js';
import {FEMALE_SINGLE_FINISH_VERSION} from '../female-single-finish-policy.js';
const root=new URL('..',import.meta.url).pathname,env={OPENAI_API_KEY:'openai-test',ARK_API_KEY:'ark-test'};
const png=await sharp({create:{width:96,height:128,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:80,height:115,channels:4,background:'#bd9887'}}).png().toBuffer(),left:8,top:13}]).png().toBuffer();
const ok=()=>({ok:true,status:200,headers:{get:()=> 'request-id'},json:async()=>({output:[{type:'image_generation_call',status:'completed',result:png.toString('base64')}]})});
test('only Thai females choose OpenAI; English and males retain exact Seedream function and credential',()=>{
 for(const fields of [{portraitMode:'female'},{portraitMode:'female',hairId:'seedream-14'}]){const p=portraitProviderFor(fields,env);assert.equal(p.id,'openai');assert.equal(p.key,env.OPENAI_API_KEY);assert.equal(p.requestPortrait,requestOpenAIPortrait)}
 for(const fields of [{portraitMode:'male'},{interfaceLanguage:'en',portraitMode:'female'},{interfaceLanguage:'en',portraitMode:'male'},{portraitMode:'female',hairId:'thai-male-auto'},{}]){const p=portraitProviderFor(fields,env);assert.equal(p.id,'seedream');assert.equal(p.key,env.ARK_API_KEY);assert.equal(p.requestPortrait,requestReviewSeedream)}
 assert(isThaiFemalePortrait({portraitMode:'male',hairId:'seedream-14'}),'Catalogue gender must match the actual pipeline, not stale UI mode');
 assert.throws(()=>portraitProviderFor({portraitMode:'female'},{ARK_API_KEY:'present'}),e=>e.code==='openai_not_configured');assert.equal(portraitProviderFor({portraitMode:'male'},{ARK_API_KEY:'present'}).id,'seedream');
});
test('OpenAI receives the exact original long prompt and every numbered reference byte in one image edit',async()=>{
 const options={key:env.OPENAI_API_KEY,prompt:'Keep ALL original instructions.\n'.repeat(3000),size:'1824x2432',portrait:png,portraitMime:'image/png',hair:Buffer.from('hair'),identity:Buffer.from('identity'),makeup:Buffer.from('makeup'),outfit:Buffer.from('outfit'),skinReference:Buffer.from('skin'),neckReference:Buffer.from('neck'),neckShapeReference:Buffer.from('shape'),hairPlacementReference:Buffer.from('placement'),compositionReference:Buffer.from('composition'),makeupStudioReference:Buffer.from('makeup-guide'),outfitDetailReference:Buffer.from('outfit-detail'),adaptiveComposition:Buffer.from('adaptive')};let count=0;
 const result=await requestOpenAIPortrait(options,{fetchImpl:async(url,init)=>{count++;assert.equal(url,OPENAI_PORTRAIT_ENDPOINT);assert.equal(init.headers.Authorization,'Bearer openai-test');const body=JSON.parse(init.body);assert.equal(body.model,OPENAI_RESPONSES_MODEL);assert.equal(body.tools[0].model,OPENAI_PORTRAIT_MODEL);assert.equal(body.tools[0].quality,'xhigh');assert.equal(body.tools[0].size,options.size);assert.equal(body.input[0].content[0].text,normalizeOpenAIPhotographicFinish(options.prompt)+'\n\n'+openaiPhotographicInstruction(options));assert.equal(body.max_tool_calls,1);assert.equal(body.parallel_tool_calls,false);assert.equal(body.store,false);const refs=seedreamReviewPayload(options).image;assert.deepEqual(body.input[0].content.slice(1).map(x=>x.image_url),refs);return ok()}});
 assert.equal(count,1);assert(result.png.equals(png));assert.equal(result.provider,'openai');
});
test('refusal, quota/server failure, invalid output and timeout never retry or switch provider',async()=>{
 for(const [status,body,code] of [[400,{error:{code:'moderation_blocked'}},'AI_OUTPUT_REJECTED'],[429,{error:{code:'rate_limit_exceeded'}},'openai_failed'],[500,{},'openai_failed'],[200,{output:[]},'openai_empty_result'],[200,{output:[{type:'image_generation_call',status:'completed',result:Buffer.from('not png').toString('base64')}]},'openai_invalid_png']]){let calls=0;await assert.rejects(requestOpenAIPortrait({key:'test',portrait:png,prompt:'same'},{fetchImpl:async()=>{calls++;return {ok:status===200,status,json:async()=>body}}}),e=>e.code===code);assert.equal(calls,1)}
 let calls=0;await assert.rejects(requestOpenAIPortrait({key:'test',portrait:png,prompt:'same'},{timeoutMs:5,fetchImpl:(_url,{signal})=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))}}),e=>e.code==='openai_timeout');assert.equal(calls,1);
});
test('actual Thai female Natural and Makeup requests send the same assembled reference order to OpenAI once',async()=>{
 for(const [finish,bodyPortrait] of [['natural',true],['makeup',true],['natural',false],['makeup',false]]){
  const fields={portraitMode:'female',femaleEyeStyle:finish,thaiOutfitAiVersion:'th-full-outfit-ai-v1',thaiOutfitAppearanceVersion:THAI_OUTFIT_APPEARANCE_VERSION,thaiBodyGeometryVersion:THAI_BODY_GEOMETRY_VERSION,thaiRealFaceVersion:THAI_REAL_FACE_VERSION,thaiCollarlessVersion:THAI_COLLARLESS_VERSION,englishOutfitFidelityVersion:ENGLISH_OUTFIT_FIDELITY_VERSION,englishStudioFinishVersion:ENGLISH_TEMPLATE_BODY_FINISH_VERSION,portraitComposition:'en-outfit-body-v1',hairReferenceVersion:'picker-hair-v1',hairId:'seedream-14',neckOutfitReferencePath:'/assets/government-uniforms/female-operational.png',faceIdentityBox:JSON.stringify([.2,.1,.8,.7]),thaiAdaptiveFaceGeometry:JSON.stringify({version:1,faceAspect:1.48,jawRatio:.75,eyeRatio:.53}),studioSkinVersion:ORIGINAL_PORTRAIT_AI_VERSION,singlePassPortraitVersion:'single-pass-portrait-v1',femaleFinishSingleVersion:FEMALE_SINGLE_FINISH_VERSION};
  if(!bodyPortrait)for(const key of ['thaiOutfitAiVersion','thaiOutfitAppearanceVersion','thaiBodyGeometryVersion','thaiRealFaceVersion','thaiCollarlessVersion','englishOutfitFidelityVersion','englishStudioFinishVersion','portraitComposition','neckOutfitReferencePath','thaiAdaptiveFaceGeometry'])delete fields[key];
  const provider=portraitProviderFor(fields,env);let requests=0;
  const result=await processProductionPortrait({input:{buffer:png,mimetype:'image/png'},fields,root,key:provider.key,removeBackground:async()=>png,requestPortrait:options=>provider.requestPortrait(options,{fetchImpl:async(_url,{body})=>{requests++;const payload=JSON.parse(body);if(finish==='makeup')assert(payload.input[0].content[0].text.includes(OPENAI_CRISP_MAKEUP_POLICY),'Actual Makeup uses the corrected texture policy');assert.equal(payload.input[0].content[0].text,normalizeOpenAIPhotographicFinish(options.prompt)+'\n\n'+openaiPhotographicInstruction(options));const refs=seedreamReviewPayload(options).image;assert.deepEqual(payload.input[0].content.slice(1).map(x=>x.image_url),Array.isArray(refs)?refs:[refs]);if(bodyPortrait){assert.equal(payload.tools[0].size,options.size);assert.match(options.prompt,/MEASURED COMPOSITION/)}return ok()}})});
  assert(result.length);assert.equal(requests,1);
 }
});
test('server routes direct/queued portrait, alternate finish and owned job outfit through the same policy',async()=>{
 const server=await readFile(root+'server.js','utf8');assert(server.includes('const provider=portraitProviderFor(req.body)'));assert(server.includes('const provider=portraitProviderFor(fields)'));assert(server.includes('const provider=portraitProviderFor(owned.fields||{})'));assert(server.includes('natural:naturalJob.result,fields,key:provider.key,requestPortrait:audit.requestPortrait'));assert(server.includes('const owned=await getAiJobEditContext(jobId,wid)'));
 const main=await readFile(root+'src/main.jsx','utf8');assert(main.includes("!englishPreviewEnabled()&&gender==='female'?[THAI_FEMALE_OPENAI_VERSION]"));assert(main.includes("!englishPreviewEnabled()&&options.portraitMode==='female'?[THAI_FEMALE_OPENAI_VERSION]"));assert(main.includes("!englishPreviewEnabled()&&mode==='female'?[THAI_FEMALE_OPENAI_VERSION]"));assert(!main.includes('THAI_NATIVE_HEAD_FIT_VERSION'),'Unapproved PR151 must remain separate');
});

test('long prompts are never shortened, and incomplete/multiple image responses never trigger another call',async()=>{
 const prompt='exact original input\n'.repeat(4000);assert.equal(openaiPortraitPayload({portrait:png,prompt}).input[0].content[0].text,prompt+'\n\n'+OPENAI_SKIN_DETAIL_INSTRUCTION);
 for(const output of [[{type:'image_generation_call',status:'in_progress',result:png.toString('base64')}],[{type:'image_generation_call',status:'completed',result:png.toString('base64')},{type:'image_generation_call',status:'completed',result:png.toString('base64')}],[]]){let calls=0;await assert.rejects(requestOpenAIPortrait({key:'test',portrait:png,prompt},{fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({output})}}}),e=>e.code==='openai_empty_result');assert.equal(calls,1)}
});

test('skin detail request preserves explicit dimensions and uses portrait 2K default without another edit',()=>{
 const base={portrait:png,prompt:'Natural or selected Makeup'};
 const payload=openaiPortraitPayload(base);
 assert.equal(payload.tools[0].size,'1824x2432');
 assert.equal(payload.tools[0].quality,'xhigh');
 assert.equal(payload.tools[0].model,OPENAI_PORTRAIT_MODEL);
 assert.equal(payload.max_tool_calls,1);
 assert.equal(openaiPortraitPayload({...base,size:'2048x2048'}).tools[0].size,'2048x2048');
 assert.match(payload.input[0].content[0].text,/Makeup retains the requested temporary-blemish correction/);
 assert.equal(base.prompt,'Natural or selected Makeup');
});

test('camera framing is limited to the full-body request, while makeup detail never contaminates Natural',()=>{
 const natural=openaiPhotographicInstruction({thaiRealFaceVersion:'body'});
 assert(natural.includes(OPENAI_FULL_FRAME_INSTRUCTION));
 assert(!natural.includes(OPENAI_MAKEUP_DETAIL_INSTRUCTION));
 const makeup=openaiPhotographicInstruction({makeupStudioReference:Buffer.from('guide')});
 assert(makeup.includes(OPENAI_MAKEUP_DETAIL_INSTRUCTION));
 assert(!makeup.includes(OPENAI_FULL_FRAME_INSTRUCTION),'Dedicated makeup edits must preserve their existing frame');
 assert(!openaiPhotographicInstruction({}).includes(OPENAI_FULL_FRAME_INSTRUCTION),'Head-only edits keep their original scope');
});
