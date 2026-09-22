import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const server=fs.readFileSync('server.js','utf8');

assert.match(client,/const neckOrShoulder=bd\[j\+3\]>80&&y>chinY-eyeD\*\.04/,
 'body-skin protection must start below the jaw and must not erase scalp hair');
assert.match(client,/if\(neckOrShoulder\|\|centralFace\)ad\.data\[j\+3\]=0/,
 'only face centre and neck\/shoulder skin may subtract selected hair');
assert.match(client,/async function refineSkinTextureBlob\(blob\)/,
 'skin texture refinement must operate on the coherent image layer');
assert.match(client,/const amount=\.24\*\(mask\[j\+3\]\/255\)/,
 'pore clarity must use a restrained skin-mask-only unsharp amount');
assert.doesNotMatch(client,/restoreOriginalFacePixels\(removedHeadNeck,f\)/,
 'V207 must not paste a second face layer over the result');
assert.match(server,/no pasted face, overlay band, horizontal rectangle/,
 'the generation request must prohibit the V206 forehead overlay artifact');

console.log('V207 visible selected hair and seamless skin checks passed');
