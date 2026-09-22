import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const server=fs.readFileSync('server.js','utf8');

assert.match(client,/async function restoreOriginalFacePixels\(processedBlob,originalFile\)/,
 'V206 must restore the photographed face after the AI operation');
assert.match(client,/alignFaceCanvas\(original,of,pf,W,H\)/,
 'the original face must be aligned from original to processed eye landmarks');
assert.doesNotMatch(client,/const cleanHeadNeck=await restoreOriginalFacePixels\(removedHeadNeck,f\)/,
 'the face must not be pasted over the coherent generated layer');
assert.match(client,/const cleanHeadNeck=await refineSkinTextureBlob\(removedHeadNeck\)/,
 'the coherent layer must receive only local skin-texture refinement');
assert.match(client,/if\(!neck\|\|\(!segmentedHair&&skinAlpha<\.10\)\)\{d\[i\+3\]=0/,
 'non-skin clothing and lower torso must be removed below the jaw');
assert.match(server,/Stop the person layer immediately below this upper-collar fitting area: no lower torso/,
 'the clean-base request must stop below the upper-collar fitting area');
assert.match(server,/as wide as the midpoint between the neck and each shoulder joint/,
 'the neck base must cover deep and wide collar templates');

console.log('V207 seamless face and upper-collar checks passed');
