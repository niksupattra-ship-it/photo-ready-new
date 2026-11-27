import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PORTRAIT_REFERENCE_HASHES} from '../portrait-reference-assets.js';
import {portraitReferenceRevision,requireCurrentPortraitReferences} from '../portrait-reference-revision.js';
import {shouldRecoverHairSubmission,FEMALE_HAIR_SUBMISSION_REVISION as REV} from '../src/female-hair-submission.js';
test('free short hair revision is the actual native 42.png hash and keeps outfits distinct',async()=>{
 const image=await readFile(new URL('../public/assets/seedream-hairstyles/references/42.png',import.meta.url));
 assert.equal(PORTRAIT_REFERENCE_HASHES.hair['seedream-42'],createHash('sha256').update(image).digest('hex'));
 const template='/assets/government-uniforms/female-operational.png',key=portraitReferenceRevision('seedream-42',template);
 assert(key.startsWith(PORTRAIT_REFERENCE_HASHES.hair['seedream-42']+'.'));
 requireCurrentPortraitReferences({hairId:'seedream-42',neckOutfitReferencePath:template,portraitReferenceRevision:key});
 assert.throws(()=>requireCurrentPortraitReferences({hairId:'seedream-42',neckOutfitReferencePath:template,portraitReferenceRevision:'old-files'}),e=>e.status===409&&e.code==='PORTRAIT_REFERENCE_UPDATED');
 assert.notEqual(key,portraitReferenceRevision('seedream-42','/assets/government-uniforms/female-academic.png'));
 requireCurrentPortraitReferences({hairId:'seedream-42',neckOutfitReferencePath:template});
});
test('file revision changes recover in-flight intent but never reuse a completed old-reference portrait',()=>{
 const before=JSON.stringify(['pipeline',REV,'female-reference-assets:old','seedream-42','outfit','makeup']);
 const after=JSON.stringify(['pipeline',REV,'female-reference-assets:new','seedream-42','outfit','makeup']);
 assert(shouldRecoverHairSubmission(before,after,'processing'));assert(shouldRecoverHairSubmission(before,after,'queued'));assert(!shouldRecoverHairSubmission(before,after,'completed'));
 const other=JSON.stringify(['pipeline',REV,'female-reference-assets:new','seedream-14','outfit','makeup']);assert(!shouldRecoverHairSubmission(before,other,'processing'));
});
