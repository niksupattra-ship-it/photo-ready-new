import test from 'node:test';
import assert from 'node:assert/strict';
import {FEMALE_HAIR_SUBMISSION_REVISION as REV,sameHairIntentBeforeUpgrade,shouldRecoverHairSubmission} from '../src/female-hair-submission.js';
test('old in-flight same-intent hair jobs resume without resubmission, but old completed outputs do not replace a new hair request',()=>{
 const previous=JSON.stringify(['pipeline','seedream-05','outfit-A','makeup']),current=JSON.stringify(['pipeline',REV,'seedream-05','outfit-A','makeup']);
 assert(sameHairIntentBeforeUpgrade(previous,current));
 for(const status of ['queued','processing'])assert(shouldRecoverHairSubmission(previous,current,status));
 for(const status of ['completed','failed','cancelled'])assert(!shouldRecoverHairSubmission(previous,current,status));
 for(const status of ['queued','processing','completed'])assert(shouldRecoverHairSubmission(current,current,status));
 for(const other of [JSON.stringify(['pipeline','seedream-24','outfit-A','makeup']),JSON.stringify(['pipeline','seedream-05','outfit-B','makeup']),JSON.stringify(['pipeline','seedream-05','outfit-A','natural']),'bad-json'])assert(!sameHairIntentBeforeUpgrade(other,current));
 assert(!sameHairIntentBeforeUpgrade(previous,JSON.stringify(['pipeline',REV,REV,'seedream-05','outfit-A','makeup'])));
});
