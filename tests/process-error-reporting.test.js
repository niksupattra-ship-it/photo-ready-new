import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitJobError} from '../src/portrait-job-error.js';
import {processFailureMessage} from '../src/processing-copy.js';
import {analyticsTagError,classifyProcessFailure} from '../src/analytics.js';

const providerPrefix='ประมวลผลไม่สำเร็จ: Seedream ประมวลผลไม่สำเร็จ (400): ';
test('input-image provider refusal is understood without leaking the provider request ID',()=>{
 const e=portraitJobError(providerPrefix+'The request failed because the input image may contain sensitive information. Request id: private-id-123');
 assert.equal(e.code,'AI_INPUT_REJECTED');
 assert.equal(e.retryable,false);
 assert.equal(classifyProcessFailure(e,'ai_job').failure_reason,'ai_input_rejected');
 assert.match(processFailureMessage(e,false),/รูปต้นฉบับ/);
 assert.match(processFailureMessage(e,true),/uploaded photo/);
 assert.doesNotMatch(e.message,/private-id-123/);
});
test('output-image provider refusal is distinct from input rejection',()=>{
 const e=portraitJobError(providerPrefix+'The request failed because the output image may contain sensitive information. Request id: private-id-456');
 assert.equal(e.code,'AI_OUTPUT_REJECTED');
 assert.equal(classifyProcessFailure(e,'ai_job').failure_reason,'ai_output_rejected');
 assert.match(processFailureMessage(e,true),/generated result/);
 assert.doesNotMatch(e.message,/private-id-456/);
});
test('legacy structured provider code still classifies',()=>{
 const e=portraitJobError('AI error: {"error":{"code":"InputImageSensitiveContentDetected"}}');
 assert.equal(e.code,'AI_INPUT_REJECTED');
});
test('busy jobs are blocked, not counted as processing failures',()=>{
 const e=analyticsTagError(Object.assign(Error('still working'),{code:'ACTIVE_AI_JOB',status:429}),{error_stage:'submit_job',http_status:429});
 const diagnostic=classifyProcessFailure(e,'prepare_or_submit');
 assert.equal(diagnostic.event,'idprom_process_blocked');
 assert.equal(diagnostic.failure_reason,'already_processing');
 assert.equal(diagnostic.http_status,429);
 assert.match(processFailureMessage(e,true),/Another AI photo/);
});
test('credit exhaustion and user cancellation do not inflate error counts',()=>{
 assert.equal(classifyProcessFailure(Object.assign(Error('no credits'),{status:402}),'submit_job').event,'idprom_process_blocked');
 assert.equal(classifyProcessFailure(Object.assign(Error('cancelled'),{code:'USER_CANCELLED'}),'compose').event,'idprom_process_cancelled');
});
test('network, timeout and composition failures remain separate',()=>{
 assert.equal(classifyProcessFailure(Error('Failed to fetch'),'poll_job').failure_reason,'network_error');
 assert.equal(classifyProcessFailure(Object.assign(Error('timeout'),{name:'TimeoutError',code:'REQUEST_TIMEOUT'}),'poll_job').failure_reason,'request_timeout');
 assert.equal(classifyProcessFailure(Error('no layer'),'compose').failure_reason,'compose_failed');
});
test('unrecognized errors do not expose raw messages in UI or analytics',()=>{
 const e=Error('Request id: 123456 & user@example.org');
 const diagnostic=classifyProcessFailure(e,'ai_job');
 assert.equal(diagnostic.failure_reason,'ai_job_failed');
 assert.equal(diagnostic.error_code,'unknown');
 assert.doesNotMatch(processFailureMessage(e,false),/123456|example.org/);
 assert.doesNotMatch(processFailureMessage(e,true),/123456|example.org/);
});
