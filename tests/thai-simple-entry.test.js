import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Thai root starts screenshot-inspired upload flow, not the old SEO catalogue',async()=>{
 const main=await read('src/main.jsx'),home=await read('src/idprom-simple-home.jsx');
 assert(main.includes("const seoInformationPage=!englishPreviewEnabled()&&['/id-photo','/id-photo/'].includes(window.location.pathname)"));
 assert(main.includes('const easyLanding=showHome&&!seoInformationPage?'));
 assert(main.includes('(seoInformationPage||englishPreviewEnabled())&&<main'));
 assert(home.includes('สร้างรูปติดบัตร')&&home.includes('เริ่มทำรูปเลย'));
 assert(home.includes('onClick={onUpload}'),'Real upload callback, not a simulated upload');
 assert(home.includes('href="/id-photo/"'),'Customers can still read old SEO information');
 assert(!home.includes('รูปของฉัน'),'The new main path has no gallery');
});

test('Thai finished photo offers hair, suit, government badges, and original paid download',async()=>{
 const easy=await read('src/easy-mode.jsx'),studio=await read('src/studio-editor.jsx');
 assert(easy.includes('!englishPreviewEnabled()&&!hasResult&&!templates.length'));
 assert(easy.includes('className="idprom-result-download"')&&easy.includes('onClick={onDownload}'));
 assert(easy.includes("onClick={()=>openTab('hair')}"));
 assert(easy.includes("onClick={()=>openTab('suit')}"));
 assert(easy.includes("governmentResult&&<button type=\"button\""));
 assert(easy.includes("setAdjustOpen(englishPreviewEnabled())"),'Thai mobile must not pop open sliders after AI');
 assert(studio.includes("onDownload={()=>exportImage('image/png')}"),'Reuse existing checkout rights and download');
 assert(studio.includes("governmentAutoPlace:true"),'Existing insignia overlay remains linked');
});

test('Original Thai guide keeps an independent canonical and sitemap entry',async()=>{
 const server=await read('server.js'),sitemap=await read('public/sitemap.xml');
 assert(server.includes("app.get(['/id-photo','/id-photo/']"));
 assert(server.includes('<link rel="canonical" href="https://idpromth.com/id-photo/">'));
 assert(sitemap.includes('<loc>https://idpromth.com/id-photo/</loc>'));
 assert(server.includes("registerEnglishLanding(app"),'English remains on its independent public route');
});
