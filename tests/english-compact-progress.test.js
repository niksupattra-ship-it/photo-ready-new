import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {englishTemplateBodyPrompt} from '../english-template-body-prompt.js';
import {englishHeadPortraitPrompt} from '../english-head-prompt.js';
import {englishNaturalStudioSkin,ENGLISH_CLEAN_EAR_AND_SILHOUETTE_POLICY} from '../english-studio-finish.js';
import {ENGLISH_MAKEUP_NATURAL_LIGHT_LOCK} from '../english-makeup-light-policy.js';
const s=readFileSync(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');
const u=readFileSync(new URL('../src/english-portrait-flow.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/english-portrait-flow.css',import.meta.url),'utf8');
test('English progress is on photo, Thai process dialogs untouched, cancel retained',()=>{
 assert(s.includes('className="english-stage-progress"'));
 assert(s.includes('!englishFlow&&processActive&&'));
 assert(s.includes('!englishFlow&&hairPlacementProgress!==null&&'));
 assert(s.includes('href="#cancel-edit" role="button"'));
 assert(css.includes('.idstudio .studio-stage>.english-stage-progress'));
});
test('Concise English UI',()=>{
 assert(u.includes('2. Edit method'));
 assert(u.includes('3. Outfit &amp; finish'));
 assert(!u.includes('Portrait Studio'));
 assert(!u.includes('Create your portrait, your way.'));
 assert(u.includes('>Create with AI</strong>')&&u.includes('>Edit manually</strong>'));
});
test('English-only portrait prompts remove ear wisps, jewelry, and black halo',()=>{
 for(const p of [englishNaturalStudioSkin(),englishHeadPortraitPrompt(),englishTemplateBodyPrompt({identityIndex:2,outfitIndex:1}),ENGLISH_MAKEUP_NATURAL_LIGHT_LOCK]){
  assert(/earrings/i.test(p));assert(/wisps/i.test(p));assert(/black|charcoal/i.test(p));
 }
 assert(/main selected hairstyle/.test(ENGLISH_CLEAN_EAR_AND_SILHOUETTE_POLICY));
});
