import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateHairRootTarget,hairRootTargetInstruction} from './hair-root-target.js';

const highRaw={brow:{x:.5,y:.48},nose:{x:.5,y:.60},chin:{x:.5,y:.86},forehead:{x:.5,y:.27}};
const high=calculateHairRootTarget(highRaw);
assert.ok(high.bounds);
assert.ok(high.target.y>=high.bounds.minY&&high.target.y<=high.bounds.maxY,
  'a high geometric estimate must be pulled into the subject forehead band');
assert.equal(high.target.y,high.bounds.minY);

const lowRaw={brow:{x:.5,y:.55},nose:{x:.5,y:.65},chin:{x:.5,y:.86},forehead:{x:.5,y:.10}};
const low=calculateHairRootTarget(lowRaw);
assert.ok(low.bounds);
assert.ok(low.target.y>=low.bounds.minY&&low.target.y<=low.bounds.maxY,
  'a low geometric estimate must be pulled into the subject forehead band');
assert.equal(low.target.y,low.bounds.maxY);

const instruction=hairRootTargetInstruction(high);
assert.match(instruction,/measured vertical band/);
assert.match(instruction,/NOT the top of the hair or fringe endpoint/);
const legacy=calculateHairRootTarget({brow:highRaw.brow,nose:highRaw.nose,chin:highRaw.chin});
assert.equal(legacy.target.y,highRaw.brow.y-(highRaw.chin.y-highRaw.nose.y),
  'older callers without a forehead landmark retain their existing target formula');

const client=fs.readFileSync(new URL('./src/main.jsx',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('./server.js',import.meta.url),'utf8');
assert.match(client,/forehead:\{x:face\[10\]\.x,y:face\[10\]\.y\}/,
  'live hairstyle processing must pass the detected forehead landmark');
assert.match(client,/seedream-clean-head-png-hair-v244/,
  'old cached results must not bypass the updated PNG placement path');
assert.match(client,/cleanHeadOnly/,'the selected-style request must ask Seedream for a clean scalp');
assert.match(client,/async function fitSelectedPngHairstyle\(aiHeadNeck,originalBlob,hairId\)[\s\S]{0,450}makeCleanHeadMaster\(aiHeadNeck,originalBlob\)[\s\S]{0,100}localHairstyleOnCleanMaster\(cleanHead\.blob,hairId\)/,
  'shared fitting path must restore original face and neck before placing the PNG');
assert.match(client,/Keep the immutable visible skin \(face AND neck\) independently of the AI\./,
  'clean-head restoration must preserve original neck skin');
assert.match(client,/processedHair&&HAIRSTYLE_RULES\[processedHair\][\s\S]{0,100}\?originalHeadNeckTransparent[\s\S]{0,80}:await optionalHealthySkin10/,
  'hair-only fitting must skip automatic recoloring of restored face and neck');
assert.match(client,/mapAlignedFacePoint/,'the fitted PNG must be anchored to measured face landmarks');
assert.match(server,/req\.body\?\.cleanHeadOnly==="1"/,
  'the server must honor the clean-head request while preserving the selected style ID');
assert.match(client,/const fittedAiHead=await fitSelectedPngHairstyle\(aiHeadNeck,originalFile,processedHair\);[\s\S]{0,100}removeBackgroundBlob\(fittedAiHead\)/,
  'first processing must use the shared fitter before background removal');
assert.equal((client.match(/const fittedHair=await fitSelectedPngHairstyle\(aiHeadNeck,firstUploadedPhoto,id\|\|''\);/g)||[]).length,2,
  'both hairstyle-change routes must fit the selected PNG before displaying the result');
assert.equal((client.match(/nextMaster=id&&HAIRSTYLE_RULES\[id\]\?await finishHairlineSeam\(transparent\):transparent;/g)||[]).length,2,
  'both hairstyle-change routes must preserve the restored face and only finish the hairline');
console.log('V244 PNG hairstyle processing routes passed');
