import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const version=fs.readFileSync('VERSION.txt','utf8').trim();

assert.ok(/^V(?:208|209)$/.test(version));
assert.match(client,/const sw=source\.naturalWidth\|\|source\.width,sh=source\.naturalHeight\|\|source\.height/,
 'face alignment must support normalized Canvas hairstyle sources');
assert.match(client,/if\(!sw\|\|!sh\)throw Error/,
 'invalid source dimensions must fail before producing a NaN transform');
assert.match(client,/let visibleHair=0/,
 'selected local hair must be validated after alignment and skin protection');
assert.match(client,/visibleHair<Math\.max\(180,Math\.round\(eyeD\*eyeD\*\.12\)\)/,
 'a bald or off-canvas hairstyle composite must not be committed');
assert.match(client,/const headNeckTransparent=await refineSkinTextureBlob\(removedHeadNeck\)/,
 'the approved coherent face and skin path must remain active');
assert.doesNotMatch(client,/restoreOriginalFacePixels\(removedHeadNeck,f\)/,
 'no second face overlay may be reintroduced');

console.log('V208/V209 Canvas alignment and face preservation checks passed');
