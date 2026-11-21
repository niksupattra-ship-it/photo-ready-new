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
 assert(studio.includes("onDownload={receiveSimplePhoto}"),'Approved Thai receive button checks purchase rights first');
 assert(studio.includes("const authorized=await allowOutput(")&&studio.includes("if(authorized)void exportImage('image/png')"),'Paid users still get the original protected file export');
 assert(studio.includes("governmentAutoPlace:true"),'Existing insignia overlay remains linked');
});

test('Original Thai guide keeps an independent canonical and sitemap entry',async()=>{
 const server=await read('server.js'),sitemap=await read('public/sitemap.xml');
 assert(server.includes("app.get(['/id-photo','/id-photo/']"));
 assert(server.includes('<link rel="canonical" href="https://idpromth.com/id-photo/">'));
 assert(sitemap.includes('<loc>https://idpromth.com/id-photo/</loc>'));
 assert(server.includes("registerEnglishLanding(app"),'English remains on its independent public route');
});

test('Thai desktop and mobile share real eight-stage pages for selection, processing, results and corrections',async()=>{
 const source=await read('src/thai-mobile-journey.jsx');
 const easy=await read('src/easy-mode.jsx');
 assert(easy.includes('<ThaiMobileJourney sourcePreview={sourcePreview}'));
 assert(easy.includes('!englishPreviewEnabled()&&(sourcePreview||hasResult)&&templates.length'));
 for(const part of ['กำลังสร้างรูป','ปรับแต่งและสร้างรูป','เปลี่ยนทรงผม','เปลี่ยนชุด','เครื่องหมาย','รับรูปไม่มีลายน้ำ','สร้างรูป'])assert(source.includes(part),part);
 assert(source.includes('onGenerateHair?.(draftHair)'),'New AI generation still uses guarded original callback');
 assert(source.includes('onConfirmHair?.()'),'Changing hair still requires confirmation');
 assert(source.includes('onClick={onDownload}')&&source.includes('รับรูปไม่มีลายน้ำ'),'Receive-photo button still calls the original protected checkout/download callback');
 assert(source.includes('onStudio?.()')&&source.includes('เปิด Studio'),'Detailed editor remains available in the result-page menu');
 assert(source.includes('onSuit?.(t)'),'Suit selection retains original native asset behavior');
});

test('Thai completed result matches approved photo-first mockup without replacing working actions',async()=>{
 const result=await read('src/thai-mobile-journey.jsx');
 const theme=await read('src/thai-mobile-journey.css');
 for(const section of ['thai-mobile-flow-ready','thai-mobile-result-heading','thai-mobile-result-photo-card','thai-mobile-result-photo-summary','thai-mobile-result-success','thai-mobile-result-hair-choices','thai-mobile-result-reassurance'])assert(result.includes(section),section);
 assert(result.includes('onClick={onDownload}')&&result.includes('รับรูปไม่มีลายน้ำ'),'Main receive button retains real checkout/download');
 assert(result.includes("setSection('hair')")&&result.includes("setSection('suit')"),'Both corrections remain available on the finished photo');
 assert(result.includes('onStudio?.()'),'Detailed editor remains reachable');
 assert(theme.includes('Approved Thai result mockup')&&theme.includes('linear-gradient(115deg,#8738d6'),'The completed result has its own brand-purple styling');
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


test('completed Thai AI on mobile and desktop stays on redesigned result unless Studio is explicitly requested',async()=>{
 const studio=await read('src/studio-editor.jsx');
 const mobile=await read('src/thai-mobile-journey.jsx');
 assert.match(studio,/else if\(easyMode\)\{setPicker\(false\)\}/,
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

test('approved mockup is responsive on desktop and mobile, and upload gets a review step',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx'),css=await read('src/thai-mobile-journey.css');
 const home=await read('src/idprom-simple-home.jsx'),homeCss=await read('src/idprom-simple-flow.css');
 for(const phrase of ['thai-mobile-upload-review','thai-mobile-selection-grid','thai-mobile-result-grid','thai-mobile-step-overline','thai-mobile-hair-gallery'])assert(ui.includes(phrase),phrase);
 assert(css.includes('grid-template-columns:minmax(240px,340px) minmax(0,1fr)'),'Desktop selection is a split page');
 assert(css.includes('@media(max-width:720px)'),'Mobile selection stacks without an unreadable desktop layout');
 assert(home.includes('idprom-simple-hero')&&home.includes('รับไฟล์ทันทีหลังชำระเงินสำเร็จ'));
 assert(homeCss.includes('.idprom-simple-hero{display:grid'),'Desktop opening page is first-class, not old Studio');
});

test('receive photo opens the real package screen before file sizing for unpaid outputs',async()=>{
 const studio=await read('src/studio-editor.jsx');
 const main=await read('src/main.jsx');
 assert(studio.includes('const receiveSimplePhoto=async()=>'));
 assert(studio.includes('const authorized=await allowOutput('));
 assert(studio.includes("onCheckoutPreview({jobId:heads[0].jobId"),'Checkout preview matches the visible finished photo');
 assert(studio.includes('if(authorized)void exportImage('),'Already purchased output still downloads normally');
 assert(main.includes('const requestDownloadUnlock='),'Unpaid rights invoke real package checkout');
 assert(main.includes('setBuyOpen(true)'),'The real payment modal opens');
});

test('Thai upload review supports actual desktop file drop without bypassing original protections',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx');
 const easy=await read('src/easy-mode.jsx');
 const studio=await read('src/studio-editor.jsx');
 assert(ui.includes("onDrop={e=>{e.preventDefault();e.stopPropagation()"));
 assert(ui.includes("onSourceFile?.(file)"));
 assert(easy.includes('onSourceFile={onSourceFile}'));
 assert(studio.includes('onSourceFile={file=>{void addSourcePhoto(file)}}'));
 assert(studio.includes('currentWorkIsPaid()')&&studio.includes('showSourceWarning(file)'),'Original source-replacement paid guard remains');
});

test('after paid QR success, new photo is available only for an archived receipt',async()=>{
 const receipt=await read('src/purchase-delivery.jsx'),download=await read('src/english-download.jsx'),main=await read('src/main.jsx');
 assert(receipt.includes('receipt.archive?.id&&!receipt.archiving&&!receipt.preparing?onNewPhoto:null'),'Do not discard a receipt while saving purchased work');
 assert(download.includes('paidSuccess&&!en&&onNewPhoto'),'New photo action is only on paid Thai success');
 assert(download.includes('onClick={onNewPhoto}>เริ่มทำรูปใหม่'));
 assert(main.includes("if(!entry?.archive?.id||entry.archiving||entry.preparing)return"),'Server archive must be confirmed before leaving receipt');
 assert(main.includes("setStudioData(null);setScreen('home')"),'Start new photo returns to redesigned entry');
});


test('mobile face-model preflight stays sequential and fails closed before AI submission',async()=>{
 const main=await read('src/main.jsx');
 const a=main.indexOf('function warmPortraitResources('),b=main.indexOf('\nfunction interp(',a);
 assert(a>=0&&b>a);
 const make=env=>Function('env',`with(env){${main.slice(a,b)};return warmPortraitResources}`)(env);
 let order=[];
 const warm=make({
  getLandmarker:async()=>{order.push('face');return {ready:true}},
  getPersonSegmenter:async()=>{order.push('segment');return {ready:true}},
  loadImage:async()=>{}
 });
 await warm(new Blob(),null,{requiresSegmentation:true,english:true});
 assert.deepEqual(order,['face','segment'],'Do not concurrently initialize both WASM models on mobile');
 order=[];await warm(new Blob(),null,{requiresSegmentation:false,english:true});
 assert.deepEqual(order,['face'],'Unused segmentation model must not block whole-outfit AI');
 let failures=0;
 const failed=make({
  getLandmarker:async()=>{failures++;throw Error('temporary wasm unavailable')},
  getPersonSegmenter:async()=>{throw Error('must not start segmentation')},
  loadImage:async()=>{}
 });
 await assert.rejects(failed(new Blob(),null,{requiresSegmentation:false,english:true}),
  e=>e.code==='PORTRAIT_MODEL_UNAVAILABLE'&&e.stage==='prepare_model');
 assert.equal(failures,2,'Retry once only, never silently submit an unchecked result');
});

test('shared Easy and Studio error dialogs use white-purple colors and provide model retry',async()=>{
 const css=await read('src/studio-redesign.css');
 const editor=await read('src/studio-editor.jsx');
 const failure=await read('src/portrait-process-failure.js');
 assert(css.includes('Shared Studio and Easy popup palette'));
 assert(css.includes('.idstudio .studio-processing-overlay .studio-processing-card'));
 assert(css.includes('background:#fff;')&&css.includes('border:1px solid #dfd1f5;'));
 assert(editor.includes('studio-process-error-card'));
 assert(editor.includes("'model_initialization','recover_result'"),'The model failure must offer a safe retry action');
 assert(failure.includes('กด “ลองอีกครั้ง”'));
});


test('Thai Step 2 matches approved photo-first desktop and mobile mockup without changes elsewhere',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx');
 const css=await read('src/thai-mobile-journey.css');
 const easy=await read('src/easy-mode.jsx');
 const selectStart=ui.indexOf('!hasResult?<section className="thai-mobile-select thai-mobile-choice"');
 const resultStart=ui.indexOf("</section>:<section className={'thai-mobile-result'",selectStart);
 assert(selectStart>0&&resultStart>selectStart,'The redesigned selection must be scoped to the pre-result page');
 const select=ui.slice(selectStart,resultStart);
 assert(ui.includes("useState(()=>hasResult?'result':'choose')"),'An uploaded photo should enter the approved Step 2 directly');
 assert(ui.includes("setSection('choose')}"),'Replacing the photo must also return to Step 2');
 for(const part of ['thai-mobile-choice-steps','thai-mobile-choice-photo-wrap','thai-mobile-choice-hair-panel','thai-mobile-choice-outfit-panel','thai-mobile-choice-create','thai-mobile-choice-caption'])
  assert(select.includes(part),part);
 assert(select.indexOf('thai-mobile-choice-photo-wrap')<select.indexOf('thai-mobile-choice-hair-panel'),'Original photo must appear first');
 assert(select.indexOf('thai-mobile-choice-hair-panel')<select.indexOf('thai-mobile-choice-outfit-panel'),'Hair precedes outfit');
 assert(!select.includes('การแต่งหน้า')&&!select.includes('onSelectFaceFinish'),'Makeup is automatic and has no selector on Step 2');
 assert(select.includes("onClick={()=>chooseHair(h)}"),'Real hairstyle choice callback is preserved');
 assert(select.includes('onClick={()=>chooseSuit(t)}'),'Original native suit click remains');
 assert(select.includes('onClick={create}'),'Single AI submission remains the original callback');
 assert(select.includes('onClick={onUpload}'),'User can still replace the original image');
 assert(css.includes('Thai-only selection page: approved photo-first Step 2 mockup'),'New CSS rules are scoped');
 assert(css.includes('.thai-mobile-flow-choice .thai-mobile-selection-grid.thai-mobile-choice-grid'));
 assert(css.includes('@media(max-width:720px)'));
 assert(css.includes('flex-direction:column;gap:15px'),'Mobile Step 2 shows photo above the option cards');
 assert(easy.includes('<ThaiMobileJourney sourcePreview={sourcePreview}'),'Both desktop and mobile still use the same connected component');
 assert(ui.includes("resultReadyPage?<div className=\"thai-mobile-result-heading\""),'Result page remains its established design');
 assert(ui.includes('onClick={onDownload}'),'Purchase and download action is unchanged');
});
