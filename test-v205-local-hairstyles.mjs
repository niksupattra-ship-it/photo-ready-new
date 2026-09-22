import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('src/main.jsx','utf8');
const server=fs.readFileSync('server.js','utf8');

assert.match(client,/aiFinishPortrait\(f,useLocalHair\?'clean-head':'original'\)/,
 'initial processing must request one reusable clean base when a catalog hairstyle is selected');
assert.match(client,/localHairstyleOnCleanMaster\(cleanHeadNeck,hairId\)/,
 'initial selected hairstyle must use the same deterministic local compositor');
assert.match(client,/localHairstyleOnCleanMaster\(src,id\)/,
 'later hairstyle changes must use the local compositor');
assert.match(client,/loadImage\(`\/assets\/hair\/\$\{hairId\}\.png`\)/,
 'local compositor must load the exact selected transparent PNG');
assert.match(client,/semanticClassMask\(clean,W,H,\[2\]\)/,
 'neck and shoulder skin must be protected before hair compositing');
assert.match(client,/hairResultCacheRef\.current\.set\(id,nextMaster\)/,
 'successful deterministic results must be cached');
assert.match(server,/const requestPrompt=cleanHead\?`CREATE A TECHNICAL HEAD-AND-COLLAR FITTING LAYER/,
 'clean-head mode must submit the dedicated clean-base prompt');

const changeHair=client.slice(client.indexOf('const changeHair=async id=>'),client.indexOf('const downloadHairDonor='));
assert.doesNotMatch(changeHair,/fetch\(|requestHairstyleEngine|\/api\/hairstyle\/edit/,
 'changing hairstyle after processing must contain no network or AI call');

console.log('V205 local hairstyle zero-repeat-credit checks passed');
