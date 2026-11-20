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

test('Thai mobile uses separate live pages for selection, processing, results and corrections',async()=>{
 const source=await read('src/thai-mobile-journey.jsx');
 const easy=await read('src/easy-mode.jsx');
 assert(easy.includes('<ThaiMobileJourney sourcePreview={sourcePreview}'));
 assert(easy.includes('!englishPreviewEnabled()&&mobile&&(sourcePreview||hasResult)&&templates.length'));
 for(const part of ['กำลังสร้างรูป','เลือกแบบที่ต้องการ','เปลี่ยนทรงผม','เปลี่ยนชุด','เครื่องหมาย','ไปชำระเงิน','สร้างรูปด้วย AI'])assert(source.includes(part),part);
 assert(source.includes('onGenerateHair?.(draftHair)'),'New AI generation still uses guarded original callback');
 assert(source.includes('onConfirmHair?.()'),'Changing hair still requires confirmation');
 assert(source.includes('onDownload}>↓ รับรูปนี้'),'Payment still opens through original rights/export callback');
 assert(source.includes('onStudio}>⚙ ปรับแต่งเอง'),'Detailed editor remains available');
 assert(source.includes('onSuit?.(t)'),'Suit selection retains original native asset behavior');
});

test('Thai offer, real PromptPay, verified receipt and PNG/PDF keep connected handlers',async()=>{
 const offer=await read('src/package-offers.jsx'),payment=await read('src/promptpay-panel.jsx');
 const receipt=await read('src/purchase-delivery.jsx'),download=await read('src/english-download.jsx');
 assert(offer.includes('idprom-thai-checkout-next'));
 assert(offer.includes('onClick={()=>choose(selected)}'));
 assert(offer.includes("startCheckout(price)"),'Offer never simulates payment');
 assert(payment.includes("onPaid(data,payment)"),'Paid state comes from validated payment status');
 assert(payment.includes("payment.qrImage"),'Real QR must come from payment provider');
 assert(receipt.includes('paidSuccess={true}'));
 assert(download.includes('paidSuccess&&!en'),'Only validated Thai receipt has successful payment title');
 assert(download.includes('onAuthorize')&&download.includes('prepareEnglishDownload'),'Actual PNG/PDF rights checks intact');
});


test('completed Thai mobile AI stays on the redesigned result page instead of returning to full Studio',async()=>{
 const studio=await read('src/studio-editor.jsx');
 const mobile=await read('src/thai-mobile-journey.jsx');
 assert.match(studio,/else if\(easyMode\)\{if\(!touch\)setEasyMode\(false\);setPicker\(false\)\}/,
  'A successfully completed Thai mobile job must keep EasyMode mounted');
 assert.match(studio,/const easyUi=<>\{easyMode\?<EasyMode/,
  'The result screen remains reachable through EasyMode');
 assert.match(mobile,/hasResult\?<div className="thai-mobile-photo">/,
  'Completed image is rendered on the new mobile result page');
 assert.match(mobile,/section==='result'\?<\>/,
  'Result action menu is visible on the same page');
 assert.match(mobile,/onClick=\{onDownload\}/,
  'The receive-photo action retains the real download and checkout gate');
 assert.match(studio,/onStudio=\{\(\)=>\{setEasyMode\(false\)/,
  'Only explicit user request opens detailed Studio');
});
