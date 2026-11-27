import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {femalePromptCacheKey,FEMALE_CURRENT_PROMPT_CACHE_KEY} from '../female-prompt-cache-key.js';
import {FEMALE_PORTRAIT_PROMPT} from '../female-portrait-prompt.js';
import {thaiFemaleGuideCacheRevision} from '../thai-whole-head-guide.js';
import {createAiResultCache} from '../src/ai-result-cache.js';
import {createStudioPortraitHairHistory} from '../src/studio-portrait-hair-history.js';
import {shouldRecoverHairSubmission} from '../src/female-hair-submission.js';

test('changed skin instructions cannot restore a completed older portrait or recover its job',async()=>{
 const old=femalePromptCacheKey('previous skin instructions'),current=FEMALE_CURRENT_PROMPT_CACHE_KEY;
 assert.notEqual(old,current);
 assert.notEqual(femalePromptCacheKey(FEMALE_PORTRAIT_PROMPT+' changed'),current);
 const cache=createAiResultCache();let calls=0;
 await cache.get(old,async()=>{calls++;return new Blob(['old']);});
 const fresh=await cache.get(current,async()=>{calls++;return new Blob(['new']);});
 assert.equal(fresh.reused,false);assert.equal(await fresh.value.text(),'new');assert.equal(calls,2);
 const history=createStudioPortraitHairHistory(),query={source:{},scope:'same-account',template:'same-outfit',mode:'female',hair:'same-hair',finish:'makeup'};
 history.remember({...query,version:old,master:{pixels:'old'},lock:{},jobId:'old-job'});
 assert.equal(history.find({...query,version:current}),null);
 assert.equal(shouldRecoverHairSubmission(JSON.stringify(['same-input',old]),JSON.stringify(['same-input',current]),'completed'),false);
});

test('portrait generation, submission recovery and accepted hair history all carry the actual prompt fingerprint',()=>{
 assert(thaiFemaleGuideCacheRevision(true,'female').includes(FEMALE_CURRENT_PROMPT_CACHE_KEY));
 assert.deepEqual(thaiFemaleGuideCacheRevision(true,'male'),[]);
 assert.deepEqual(thaiFemaleGuideCacheRevision(false,'female'),[]);
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const hair=main.slice(main.indexOf(' const hairResultKey='),main.indexOf(' const hairResultScope='));
 assert(hair.includes('...thaiFemaleGuideCacheRevision(!englishPreviewEnabled(),mode)'));
 const portrait=main.slice(main.indexOf(' const key=JSON.stringify([SINGLE_PASS_PORTRAIT_VERSION'),main.indexOf('const cached=await portraitResultCache.get'));
 assert(portrait.includes('...thaiFemaleGuideCacheRevision(thaiWholeOutfit,gender)'));
 const submission=main.slice(main.indexOf(' const submissionKey=JSON.stringify'),main.indexOf(' const sourceDigest=',main.indexOf(' const submissionKey=JSON.stringify')));
 assert(submission.includes('...thaiFemaleGuideCacheRevision(thaiWholeOutfit,options.portraitMode)'));
});
