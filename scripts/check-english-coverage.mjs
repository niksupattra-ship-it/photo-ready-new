// Audit all shipped client copy and server response strings, without running services.
import assert from 'node:assert/strict';
import {parseAst} from 'rolldown/parseAst';
import {readFile,readdir} from 'node:fs/promises';
import {translateEnglish,ENGLISH_COPY} from '../src/english-preview.js';
const thai=/[\u0E00-\u0E7F]/;
// These are private AI instructions, not interface copy. Localization must not
// change the processing policy. The original Thai delivery template is reachable
// only on the Thai route; its English counterpart is tested separately.
const promptPhrases=new Set([
 'เปลี่ยนทรงผมให้กับคนในภาพที่ 1 เป็นทรงที่แนบในภาพที่ 2 พร้อมปรับผิว แต่งหน้าและเตรียมคอในภาพเดียว',
 'เป็นทรงที่แนบในภาพที่ 2','เป็นผมสั้นสุภาพตามคำสั่งด้านล่าง','ไม่ฟอกผิว',
 'ให้ผิวขาวสว่างฟุ้งตามข้อกำหนดแต่งหน้าหญิง โดยคงเอกลักษณ์และมิติผิวของคนเดิม',
 'เปลี่ยนเฉพาะทรงผมให้ตรงกับภาพที่ 2 ซึ่งเป็นทรงที่ผู้ใช้กดเลือก',
 'รวบเก็บผมทั้งหมดให้สั้นกระชับแนบศีรษะ เปิดหูทั้งสองข้างและคอ ไม่มีผมยาวห้อยด้านหลัง'
]);
const missing=[],audited=new Set();let sourceFiles=0,excluded=0;
for(const directory of ['src','.'])for(const name of await readdir(directory)){
 if(!/\.(?:js|jsx)$/.test(name)||/english|language-switch/.test(name))continue;
 const file=directory+'/'+name,source=await readFile(file,'utf8');const ast=parseAst(source,{lang:name.endsWith('.jsx')?'jsx':'js'},file);sourceFiles++;
 function visit(node){if(!node||typeof node!=='object')return;let text;
  if(node.type==='Literal'&&typeof node.value==='string')text=node.value;
  if(node.type==='JSXText')text=node.value.replace(/\s+/g,' ').trim();
  if(node.type==='TemplateElement')text=node.value.cooked;
  if(text&&thai.test(text)){
   const prompt=(name==='production-portrait-pipeline.js'&&(promptPhrases.has(text)||text.startsWith('สร้างภาพติดบัตรผู้หญิงคนเดิมจากภาพที่ 1')))||(name==='review-portrait-finish.js'&&text.startsWith('FEMALE MAKEUP — ADAPTIVE'));
   const thaiDelivery=name==='purchased-photo-api.js'&&node.type==='TemplateElement'&&text.includes('<');
   if(prompt||thaiDelivery)excluded++;else{audited.add(text);if(thai.test(translateEnglish(text)))missing.push({file,text})}
  }
  for(const [key,value]of Object.entries(node))if(!['loc','range'].includes(key)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}
 }
 visit(ast);
}
assert.deepEqual(missing,[],JSON.stringify(missing,null,2));
// Translation must never reduce unknown source text to a misleading partial word.
assert.equal(translateEnglish('สมชาย ใจดี'),'สมชาย ใจดี');
assert.equal(translateEnglish('ทดสอบคำที่ไม่มีในพจนานุกรม'),'ทดสอบคำที่ไม่มีในพจนานุกรม');
for(const value of Object.values(ENGLISH_COPY))assert.equal(translateEnglish(value),value);
console.log(`PASS ${audited.size} source strings across ${sourceFiles} client/server files; ${Object.keys(ENGLISH_COPY).length} reviewed translations. No uncovered Thai UI copy. ${excluded} AI-instruction/Thai-only-template fragments explicitly excluded.`);
