import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const engine=fs.readFileSync(path.join(root,'hairstyle-engine','index.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const client=fs.readFileSync(path.join(root,'src','main.jsx'),'utf8');

assert.match(engine,/path\.join\(root,'public','assets','hair',`\$\{hairId\}\.png`\)/,
 'engine must load the exact faceless transparent hair cutout');
assert.doesNotMatch(engine,/hairstyle-previews.*\$\{hairId\}/,
 'engine must never send a face-bearing preview as the hairstyle reference');
assert.match(engine,/cacheKey\(portrait\.buffer,mask\.buffer,referenceBytes/,
 'cache identity must include the hard edit mask and exact reference bytes');
assert.match(engine,/exact FACELESS TRANSPARENT HAIRSTYLE CUTOUT/,
 'prompt must identify the exact selected transparent cutout');
assert.match(server,/upload\.fields\(\[\{name:"image",maxCount:1\},\{name:"mask",maxCount:1\}\]\)/,
 'hairstyle endpoint must accept both portrait and hard mask');
assert.match(client,/requestHairstyleEngine\(prepared\.input,id,prepared\.mask\)/,
 'post-processing hairstyle changes must use AI with the exact protected-face mask');
assert.match(client,/composeHairEdit\(generated,src,prepared\)/,
 'the provider result must contribute validated hair pixels only');
assert.doesNotMatch(client,/nextMaster=await removeBackgroundRobust\(edited,'hairstyle-result\.png'\)/,
 'client must not replace the complete master with the provider image');

for(let i=1;i<=29;i++){
 const id=`hair-${String(i).padStart(2,'0')}`;
 assert.ok(fs.existsSync(path.join(root,'public','assets','hair',`${id}.png`)),`${id} cutout missing`);
}
for(let i=1;i<=12;i++){
 const id=`manhair-${String(i).padStart(2,'0')}`;
 assert.ok(fs.existsSync(path.join(root,'public','assets','hair',`${id}.png`)),`${id} cutout missing`);
}

console.log('V209 exact hairstyle reference and face-lock regression checks passed');
