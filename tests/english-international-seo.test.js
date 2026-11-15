import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {englishLandingHtml,ENGLISH_LANDING_URL} from '../english-seo-page.js';
import {englishPreviewEnabled,languageLink,localizedLink} from '../src/english-preview.js';

test('English landing is independently indexable with native English copy',async()=>{
 const thai=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const html=englishLandingHtml(thai);
 assert.match(html,/<html lang="en">/);
 assert.match(html,/<meta name="robots" content="index,follow,max-image-preview:large">/);
 assert.match(html,/<link rel="canonical" href="https:\/\/idpromth\.com\/en\/">/);
 assert.match(html,/Create Professional ID and Job Application Photos Online/);
 assert.match(html,/"inLanguage": "en"/);
 assert.doesNotMatch(html,/วิธีทำรูปติดบัตรออนไลน์กับ IDพร้อม/);
 assert.equal(ENGLISH_LANDING_URL,'https://idpromth.com/en/');
 assert.match(thai,/<html lang="th">/);
 assert.match(thai,/<link rel="canonical" href="https:\/\/idpromth\.com\/">/);
});
test('Thai is default, English has a separate path, old links still work',()=>{
 assert.equal(englishPreviewEnabled({pathname:'/',search:''}),false);
 assert.equal(englishPreviewEnabled({pathname:'/en/',search:''}),true);
 assert.equal(englishPreviewEnabled({pathname:'/',search:'?lang=en'}),true);
 assert.equal(languageLink({href:'https://idpromth.com/'},true),'/en/');
 assert.equal(languageLink({href:'https://idpromth.com/en/'},false),'/');
 assert.equal(localizedLink('/',{href:'https://idpromth.com/en/',pathname:'/en/',search:''}),'/en/');
});
test('sitemap tells Google about both localized versions',async()=>{
 const sitemap=await readFile(new URL('../public/sitemap.xml',import.meta.url),'utf8');
 assert.match(sitemap,/<loc>https:\/\/idpromth\.com\/<\/loc>/);
 assert.match(sitemap,/<loc>https:\/\/idpromth\.com\/en\/<\/loc>/);
 assert.equal((sitemap.match(/hreflang="th"/g)||[]).length,2);
 assert.equal((sitemap.match(/hreflang="en"/g)||[]).length,2);
 assert.match(sitemap,/<loc>https:\/\/idpromth\.com\/job-photo\.html<\/loc>/);
});
