import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAst} from 'rolldown/parseAst';
import {outfitsForLanguage} from '../src/english-preview.js';
const editor=await readFile('src/easy-mode.jsx','utf8'),main=await readFile('src/main.jsx','utf8');
const ast=parseAst(editor,{lang:'jsx'},'src/easy-mode.jsx');
const component=ast.body.find(node=>node.type==='ExportNamedDeclaration'&&node.declaration?.id?.name==='EasyMode').declaration;
const declaration=name=>{const node=component.body.body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(d=>d.id.name===name));assert(node,name);return editor.slice(node.start,node.end)};
const eligible=Function('templates','gender',declaration('suitCategory')+declaration('eligibleTemplates')+'return eligibleTemplates;');
const catalogAst=parseAst(main,{lang:'jsx'},'src/main.jsx');
const catalog=name=>{const node=catalogAst.body.find(node=>node.type==='VariableDeclaration'&&node.declarations.some(d=>d.id.name===name));assert(node,name);return Function(main.slice(node.start,node.end)+'return '+name)()};
const government=[...catalog('INTERIOR_UNIFORMS').map(t=>({...t,template:t.img,gender:'male',cat:'government',group:'ข้าราชการชาย'})),...catalog('FEMALE_GOVERNMENT_UNIFORMS').map(t=>({...t,template:t.img,gender:'female',cat:'government',group:'ข้าราชการหญิง'}))];
assert.equal(government.length,8);assert.equal(government.filter(t=>t.gender==='male').length,4);
const controls=[{id:'job-m',group:'สมัครงาน',gender:'male'},{id:'job-f',group:'สมัครงาน',gender:'female'},{id:'student-m',group:'นักศึกษา',gender:'male'},{id:'student-f',group:'นักศึกษา',gender:'female'},{id:'gown-m',group:'ชุดครุย',gender:'male'},{id:'gown-f',group:'ชุดครุย',gender:'female'}];
for(const gender of ['female','male']){
 const result=eligible([...government,...controls],gender);
 assert.deepEqual(result.filter(t=>t.cat==='government').map(t=>t.id),government.map(t=>t.id));
 assert(result.some(t=>t.id==='interior-01'));assert(result.some(t=>t.id==='interior-02'));assert(result.some(t=>t.id==='interior-03'));assert(result.some(t=>t.id==='male-government-employee'));
 assert.deepEqual(result.filter(t=>t.group==='สมัครงาน'||t.group==='นักศึกษา').map(t=>t.gender),[gender,gender]);
 assert.equal(result.filter(t=>t.group==='ชุดครุย').length,2);
}
const english=outfitsForLanguage([{id:'job',items:[]},{id:'government-male',items:government.filter(t=>t.gender==='male')},{id:'government-female',items:government.filter(t=>t.gender==='female')}],{search:'?lang=en'});
assert.deepEqual(english.map(g=>g.id),['job','government-female']);
assert.deepEqual(english[1].items.map(t=>t.id),['female-operational']);
console.log('PASS actual EasyMode filter retains all 4 male and 4 female government outfits for either portrait type; existing job/student gender rules, gowns and the English single-female-government trial are retained. No AI or service calls.');
