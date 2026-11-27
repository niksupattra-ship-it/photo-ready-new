import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRecoverHairSubmission} from '../src/female-hair-submission.js';
test('only identical current requests resume; changed or retired requests never resume',()=>{
 for(const status of ['queued','processing','completed'])assert(shouldRecoverHairSubmission('current','current',status));
 for(const status of ['queued','processing','completed','failed','cancelled'])assert(!shouldRecoverHairSubmission('retired','current',status));
 for(const status of ['failed','cancelled'])assert(!shouldRecoverHairSubmission('current','current',status));
});
