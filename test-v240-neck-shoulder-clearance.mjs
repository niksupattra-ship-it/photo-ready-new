import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const client=fs.readFileSync(path.join(root,'src','main.jsx'),'utf8');
const engine=fs.readFileSync(path.join(root,'hairstyle-engine','index.js'),'utf8');

const finalRule='FINAL HAIR CLEARANCE — OVERRIDES EVERY EARLIER LENGTH OR REFERENCE INSTRUCTION';
const ruleAt=server.indexOf(finalRule);
assert.ok(ruleAt>server.indexOf("req.body?.neckInputPrepared==='1'"),
  'clearance rule must follow the prepared-neck prompt that can wrap the active prompt');
assert.ok(ruleAt<server.indexOf('const portraitDataUrl=',ruleAt),
  'clearance rule must be included before the active provider receives the prompt');
assert.match(server.slice(ruleAt),/creditKind==='hairstyle'/,
  'clearance rule must be limited to replacement-hairstyle jobs');
assert.match(server.slice(ruleAt),/including hair-04 and every long loose style/,
  'long reference styles must not override the clear-neck requirement');
assert.match(server.slice(ruleAt),/entirely behind the body silhouette and out of view on the front/,
  'long sections must be routed behind the shoulders');
assert.match(client,/seedream-clean-head-png-hair-v244/,
  'old cached hairstyle outputs must not bypass the PNG hair placement cache key');
assert.match(engine,/FINAL NECK AND SHOULDER CLEARANCE — OVERRIDES EVERY EARLIER STYLE-LENGTH INSTRUCTION/,
  'legacy hairstyle endpoint must use the same clearance rule');
assert.match(engine,/v240\|single-pass-coherent-portrait-neck-shoulder-clear/,
  'legacy endpoint cache must be invalidated too');

console.log('V240 clear-neck and shoulder hairstyle checks passed');
