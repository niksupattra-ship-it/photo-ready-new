import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const server=fs.readFileSync('server.js','utf8');

assert.match(client,/aiFinishPortrait\(f,hairId\|\|'original'\)/,
 'V209 initial processing must generate the selected hairstyle with AI');
assert.doesNotMatch(client,/localHairstyleOnCleanMaster\(cleanHeadNeck,hairId\)/,
 'V209 must not paste a local hairstyle over the initial coherent head');
assert.match(client,/requestHairstyleEngine\(prepared\.input,id,prepared\.mask\)/,
 'later hairstyle changes must use the masked AI hair editor');
assert.match(client,/loadImage\(`\/assets\/hair\/\$\{hairId\}\.png`\)/,
 'local compositor must load the exact selected transparent PNG');
assert.match(client,/semanticClassMask\(clean,W,H,\[2\]\)/,
 'neck and shoulder skin must be protected before hair compositing');
assert.match(client,/hairResultCacheRef\.current\.set\(id,nextMaster\)/,
 'successful deterministic results must be cached');
assert.match(server,/opaque face-lock area is immutable and must remain pixel-for-pixel unchanged/,
 'initial AI hairstyle must retain the protected face pixels');

const changeHair=client.slice(client.indexOf('const changeHair=async id=>'),client.indexOf('const downloadHairDonor='));
assert.match(changeHair,/requestHairstyleEngine\(prepared\.input,id,prepared\.mask\)/,
 'changing to a new hairstyle must use the requested AI blending path');

console.log('V209 AI hairstyle path and legacy asset checks passed');
