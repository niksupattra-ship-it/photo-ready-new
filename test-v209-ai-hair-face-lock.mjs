import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const server=fs.readFileSync('server.js','utf8');
const engine=fs.readFileSync('hairstyle-engine/index.js','utf8');
const version=fs.readFileSync('VERSION.txt','utf8').trim();

assert.equal(version,'V209');
assert.match(client,/aiFinishPortrait\(f,hairId\|\|'original'\)/,
 'initial processing must ask AI for the selected hairstyle, not a bald clean head');
assert.doesNotMatch(client,/useLocalHair\?await localHairstyleOnCleanMaster\(cleanHeadNeck,hairId\)/,
 'initial processing must not paste a faceless PNG hairstyle over the head');
assert.match(client,/const prepared=await prepareHairEdit\(src\)/,
 'later hairstyle changes must build a hard protected-face edit mask');
assert.match(client,/requestHairstyleEngine\(prepared\.input,id,prepared\.mask\)/,
 'later hairstyle changes must use the AI hair-only editor requested by the user');
assert.match(client,/composeHairEdit\(generated,src,prepared\)/,
 'AI output must be reduced to validated hair pixels before committing');
assert.match(client,/const src=lockedMasterRef\.current\|\|initialStyledHairRef\.current\|\|editCache\.current\.master/,
 'each hairstyle must start from one immutable master to prevent face drift');
assert.match(server,/opaque face-lock area is immutable and must remain pixel-for-pixel unchanged/,
 'initial AI request must explicitly lock the face at pixel level');
assert.match(engine,/Never insert a face layer, skin rectangle, overlay band or hard geometric edge/,
 'hair-only prompt must prohibit the visible rectangular face artifact');
assert.match(engine,/v209\|gpt-image-1\.5/,
 'cache key must invalidate older local-overlay hairstyle results');

console.log('V209 AI hairstyle blending and immutable face checks passed');
