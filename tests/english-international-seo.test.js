import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {englishLandingHtml,ENGLISH_LANDING_URL,registerEnglishLanding} from '../english-seo-page.js';
import {ENGLISH_SEO_TITLE,ENGLISH_SEO_DESCRIPTION} from '../english-seo-meta.js';
import {englishPreviewEnabled,languageLink,localizedLink} from '../src/english-preview.js';
import express from 'express';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';

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

test('English landing has reciprocal language links, discoverable guides and consistent application metadata',async()=>{
 const thai=await readFile(new URL('../index.html',import.meta.url),'utf8'),html=englishLandingHtml(thai);
 for(const version of [thai,html])for(const lang of ['th','en','x-default'])assert.equal((version.match(new RegExp('hreflang="'+lang+'"','g'))||[]).length,1);
 assert(html.includes('<title>'+ENGLISH_SEO_TITLE+'</title>'));
 assert(html.includes('content="'+ENGLISH_SEO_DESCRIPTION+'"'));
 assert.match(html,/href="\/en\/job-application-photos\/"/);
 assert.match(html,/href="\/en\/photo-sizes\/"/);
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert(schema['@graph'].some(item=>item['@type']==='WebApplication'&&item.inLanguage==='en'));
 assert(schema['@graph'].every(item=>!item.aggregateRating));
 const runtime=await readFile(new URL('../src/english-preview.js',import.meta.url),'utf8');
 assert(runtime.includes('doc.title=ENGLISH_SEO_TITLE'));
 assert(runtime.includes('description.content=ENGLISH_SEO_DESCRIPTION'));
});

test('English guides have unique canonical pages and useful text available without JavaScript',async()=>{
 const sitemap=await readFile(new URL('../public/sitemap.xml',import.meta.url),'utf8');
 const titles=[];
 for(const slug of ['job-application-photos','photo-sizes']){
  const html=await readFile(new URL('../public/en/'+slug+'/index.html',import.meta.url),'utf8');
  assert.match(html,/<html lang="en">/);assert.equal((html.match(/<h1>/g)||[]).length,1);
  assert(html.includes('<link rel="canonical" href="https://idpromth.com/en/'+slug+'/">'));
  assert(sitemap.includes('<loc>https://idpromth.com/en/'+slug+'/</loc>'));
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.match(html,/<a class="cta" href="\/en\/">/);
  const schemas=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert(schemas['@graph'].some(item=>item['@type']==='Article'&&item.inLanguage==='en'));
  titles.push(html.match(/<title>([^<]+)<\/title>/)[1]);
 }
 assert.notEqual(titles[0],titles[1]);
 const sizes=await readFile(new URL('../public/en/photo-sizes/index.html',import.meta.url),'utf8');
 const source=await readFile(new URL('../src/photo-size.jsx',import.meta.url),'utf8');
 const thaiBlock=source.match(/export const PHOTO_SIZES=\[[\s\S]*?\n\];/)[0].replace('export ','');
 const englishBlock=source.match(/export const ENGLISH_PHOTO_SIZES=\[[\s\S]*?\n\];/)[0].replace('export ','');
 const presets=Function(thaiBlock+'\n'+englishBlock+';return ENGLISH_PHOTO_SIZES')();
 for(const size of presets.filter(size=>size.width))assert(sizes.includes(Math.round(size.width/25.4*300)+' × '+Math.round(size.height/25.4*300)));
});

test('English route wins over the new static directory and preserves query parameters',async()=>{
 const source=await readFile(new URL('../index.html',import.meta.url),'utf8'),app=express();
 registerEnglishLanding(app,{loadIndex:async()=>source});
 app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const redirect=await fetch(origin+'/en?utm_source=test',{redirect:'manual'});
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/en/?utm_source=test');
  const response=await fetch(origin+'/en/');assert.equal(response.status,200);
  assert.equal(response.headers.get('content-language'),'en');assert.match(await response.text(),/AI Professional Headshots/);
  for(const path of ['/en/job-application-photos/','/en/photo-sizes/','/en/guides.css'])assert.equal((await fetch(origin+path)).status,200);
  const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');
  assert(serverSource.indexOf('registerEnglishLanding(app,')<serverSource.indexOf('app.use(express.static('));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
