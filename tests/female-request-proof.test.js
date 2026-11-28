import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {femaleRequestProof,femaleBytesHash} from '../female-request-proof.js';
import {requestReviewSeedream} from '../seedream-review-transport.js';
import {FEMALE_PORTRAIT_PROMPT,FEMALE_LAB_PROCESS_VERSION} from '../female-portrait-prompt.js';
import {createMakeupRequestAudit} from '../makeup-generation-audit.js';
const png=await sharp({create:{width:16,height:16,channels:3,background:'#abc'}}).png().toBuffer();
const image='data:image/png;base64,'+png.toString('base64');
const payload={model:'dola-seedream-5-0-pro-260628',prompt:FEMALE_PORTRAIT_PROMPT,image:[image,image,image,image],size:'2K',response_format:'b64_json',output_format:'png',watermark:false};

test('proof locates changed provider inputs without retaining photos or prompt text',()=>{
 const proof=femaleRequestProof(payload);
 assert.equal(proof.requestSha256,femaleBytesHash(JSON.stringify(payload)));
 assert.deepEqual(proof.images.map(x=>x.role),['guide','hair','outfit','identity']);
 for(let i=0;i<4;i++){
  const changed={...payload,image:payload.image.map((s,n)=>n===i?'data:image/png;base64,'+Buffer.from('different input').toString('base64'):s)};
  const next=femaleRequestProof(changed);assert.notEqual(proof.requestSha256,next.requestSha256);
  assert.deepEqual(next.images.map((v,n)=>v.sha256!==proof.images[n].sha256),[0,1,2,3].map(n=>n===i));
 }
 assert.notEqual(proof.promptSha256,femaleRequestProof({...payload,prompt:payload.prompt+'changed'}).promptSha256);
 assert.notEqual(proof.requestSha256,femaleRequestProof({...payload,size:'1K'}).requestSha256);
 assert(!JSON.stringify(proof).includes(png.toString('base64')));
 assert(!JSON.stringify(proof).includes('Combine the three reference images'));
});

test('actual provider body is unchanged and proof follows the successful request into the job audit',async t=>{
 const logs=[];t.mock.method(console,'info',(...args)=>logs.push(args));let calls=0;
 const audit=createMakeupRequestAudit(options=>requestReviewSeedream(options,{fetchImpl:async(_url,req)=>{
  calls++;assert.equal(req.body,JSON.stringify(payload));
  assert.equal(req.headers.Authorization,'Bearer test-secret-never-log');
  return Response.json({data:[{b64_json:png.toString('base64')}]},{headers:{'x-request-id':'provider-test-id'}});
 }}),{requirePolicy:true});
 const result=await audit.requestPortrait({key:'test-secret-never-log',prompt:payload.prompt,preparedFemalePayload:payload,femalePreplacedVersion:FEMALE_LAB_PROCESS_VERSION,singleAttempt:true});
 assert.equal(calls,1);assert.deepEqual(result.png,png);assert.equal(result.requestId,'provider-test-id');
 assert.deepEqual(result.femaleRequestProof,femaleRequestProof(payload));
 assert.deepEqual(audit.snapshot().femaleRequestProof,result.femaleRequestProof);
 assert.equal(logs.length,2);assert(!JSON.stringify(logs).includes('test-secret-never-log'));
 const delivered=JSON.parse(logs[1][1]);assert.equal(delivered.aiPngSha256,femaleBytesHash(png));
});

test('different provider outputs can be distinguished from different request inputs',async t=>{
 t.mock.method(console,'info',()=>{});
 const other=await sharp({create:{width:16,height:16,channels:3,background:'#def'}}).png().toBuffer();
 const results=[];
 for(const output of [png,other])results.push(await requestReviewSeedream({key:'inert',prompt:payload.prompt,preparedFemalePayload:payload,femalePreplacedVersion:FEMALE_LAB_PROCESS_VERSION},{fetchImpl:async()=>Response.json({data:[{b64_json:output.toString('base64')}]})}));
 assert.deepEqual(results[0].femaleRequestProof,results[1].femaleRequestProof);
 assert.notEqual(femaleBytesHash(results[0].png),femaleBytesHash(results[1].png));
});
