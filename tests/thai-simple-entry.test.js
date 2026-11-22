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
 assert(studio.includes("onDownload={receiveSimplePhoto}"),'Easy download opens the existing preparation flow');
 assert(studio.includes("await exportImage('image/png');"),'Open the protected format and size preparation first');
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
 for(const part of ['กำลังสร้างรูป','ปรับแต่งและสร้างรูป','เปลี่ยนทรงผม','เปลี่ยนรูปใหม่','ดาวน์โหลดรูป','สร้างรูป'])assert(source.includes(part),part);
 assert(source.includes('onGenerateHair?.(draftHair)'),'New AI generation still uses guarded original callback');
 assert(source.includes('onConfirmHair?.()'),'Changing hair still requires confirmation');
 assert(source.includes('onClick={onDownload}')&&source.includes('ดาวน์โหลดรูป'),'Receive-photo button still calls the original protected checkout/download callback');
 assert(source.includes('onClick={onUpload}'),'Finished result uses the existing guarded photo-picker callback');
 assert(source.includes('onSuit?.(t)'),'Suit selection retains original native asset behavior');
});

test('Thai completed result matches approved photo-first mockup without replacing working actions',async()=>{
 const result=await read('src/thai-mobile-journey.jsx');
 const theme=await read('src/thai-mobile-journey.css');
 for(const section of ['thai-mobile-flow-ready','thai-mobile-result-photo-card','thai-mobile-result-photo-summary','thai-mobile-result-success','thai-mobile-result-hair-choices','thai-mobile-result-studio'])assert(result.includes(section),section);
 assert(result.includes('onClick={onDownload}')&&result.includes('ดาวน์โหลดรูป'),'Main receive button retains real checkout/download');
 assert(result.includes("setSection('hair')")&&!result.includes("setSection('suit')"),'Only hairstyle correction is available on this finished screen');
 assert(result.includes('เปลี่ยนรูปใหม่')&&result.includes('onClick={onUpload}'),'Replacing photo uses real guarded upload');
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

test('receive photo opens file preparation before purchase, retaining final authorization',async()=>{
 const studio=await read('src/studio-editor.jsx');
 const main=await read('src/main.jsx');
 assert(studio.includes('const receiveSimplePhoto=async()=>'));
 const receive=studio.slice(studio.indexOf(' const receiveSimplePhoto=async()=>'),studio.indexOf(' const easyUi='));assert(!receive.includes('await allowOutput('));assert(receive.includes("await exportImage('image/png')"));assert(studio.includes('consumeDownloadCredit:!downloadCrop.automaticId'));
 assert(studio.includes("onCheckoutPreview({jobId:heads[0].jobId"),'Checkout preview matches the visible finished photo');
 assert(receive.includes("await exportImage('image/png')"),'Paid and trial outputs open the same preparation');
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
 assert(!ui.includes('className="thai-mobile-result-heading"'),'Completed result omits the top back arrow and heading');
 assert(ui.includes('onClick={onDownload}'),'Purchase and download action is unchanged');
});


test('Thai Step 4 processing matches approved white-purple progress card with live percentage and unchanged cancel',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx');
 const css=await read('src/thai-mobile-journey.css');
 const processingStart=ui.indexOf('</section>:processing?<section className="thai-mobile-processing"');
 const processingEnd=ui.indexOf('</section>:!hasResult?',processingStart);
 assert(processingStart>0&&processingEnd>processingStart,'Step 4 is independently scoped between upload and selection');
 const processing=ui.slice(processingStart,processingEnd);
 for(const phrase of ['ขั้นตอน 4 / 8','กำลังสร้างรูป...','AI กำลังประมวลผลรูปของคุณ','ระบบจะนำรูปที่เสร็จแล้วมาแสดงอัตโนมัติ','thai-mobile-processing-card','thai-mobile-processing-ring'])
  assert(processing.includes(phrase),phrase);
 assert(ui.includes("+(processingPage?' thai-mobile-flow-processing':'')"),'Only processing screen receives this theme');
 assert(ui.includes("resultReadyPage||choicePage||processingPage"),'Processing header shows matching ID Prom Thai brand');
 assert(ui.includes('const shownProgress=Number.isFinite(progress)?Math.min(99,Math.max(0,Math.floor(progress))):0;'),'UI uses real bounded progress, not a fake timer');
 assert(processing.includes('aria-valuenow={shownProgress}')&&processing.includes("'--thai-processing-percent':shownProgress+'%'"),'Only the circular progress uses live progress');
 assert(!processing.includes('thai-mobile-processing-meter'),'Duplicate lower progress bar is removed');
 assert(!css.includes('.thai-mobile-flow-processing .thai-mobile-processing-meter'),'Unused progress bar styling is removed');
 assert(processing.includes('onClick={onCancelProcess}'),'Existing cancellation callback must not change');
 assert(!processing.includes('setTimeout(')&&!processing.includes('onGenerateHair'),'Progress UI must never trigger another AI request');
 assert(css.includes('Approved Thai Step 4 processing mockup'));
 assert(css.includes('.thai-mobile-flow-processing .thai-mobile-processing-card'));
 assert(css.includes('.idstudio .thai-mobile-flow-processing .thai-mobile-processing button.thai-mobile-processing-cancel'));
 assert(css.includes('@media(max-width:720px)'),'New processing card must fit narrow screens');
 assert(ui.includes('thai-mobile-choice-photo-wrap')&&ui.includes('thai-mobile-result-download'),'Choice and checkout/results screens remain available');
});


test('Thai finished photo only offers hairstyle and new photo; replacement enters original outfit-and-hair step',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx');
 const easy=await read('src/easy-mode.jsx');
 const studio=await read('src/studio-editor.jsx');
 const resultStart=ui.indexOf("<section className={'thai-mobile-result'");
 const result=ui.slice(resultStart);
 const controls=result.slice(result.indexOf("section==='result'?<>"),result.indexOf("section==='hair'?<>"));
 assert(resultStart>0&&controls.length>0,'Real result actions exist');
 assert(controls.includes('ดาวน์โหลดรูป'));assert(!controls.includes('> เปลี่ยนทรงผม</button>'),'No duplicate desktop change-hair button');assert(ui.includes('!compactResult&&resultHairChoices'),'Desktop hair thumbnails remain the entry point');
 assert(ui.includes('aria-label="เปลี่ยนรูปใหม่"'),'Photo footer exposes accessible replacement icon');
 assert(!controls.includes('เปลี่ยนชุด'),'Changing outfits is unavailable after generation');
 assert(controls.includes('governmentResult&&resultInsignia'),'Insignia button appears only for government uniforms');
 assert(!result.includes("setSection('suit')")&&!result.includes("setSection('insignia')"),'No alternate result edit route');
 assert(!ui.includes('thai-mobile-result-menu-trigger'),'Studio shortcuts are hidden from simplified result');
 assert(!ui.includes('aria-label="กลับไปเลือกทรงผม"'),'No top back arrow on completed result');
 assert(result.includes('onClick={onUpload}'),'The actual upload handler opens new photo selection from the photo footer');
 assert(ui.includes("if(srcRef.current!==sourcePreview)")&&ui.includes("setSection('choose')"),'Successful new source resets to Step 2');
 assert(ui.includes('thai-mobile-choice-outfit-panel')&&ui.includes('thai-mobile-choice-hair-panel'),'Step 2 still offers suit and hairstyle');
 assert(easy.includes('onUpload={onUpload}'),'The Easy screen forwards the upload callback');
 assert(studio.includes('onUpload={requestPhotoUpload}'),'Upload is from the existing guarded picker');
 assert(studio.includes('currentWorkIsPaid()')&&studio.includes('showSourceWarning(null)'),'Paid photo replacement retains original rights warning');
 assert(studio.includes('const next=replaceStudioSourceLayers(previous,photo)'),'A new photo replaces the current work, not the archived receipt');
 assert(studio.includes('setEasyPhotoTypeSelected(false)'),'New photo requires original type and selection workflow');
 assert(controls.includes('onClick={onDownload}'),'Protected checkout and download remain');
 assert(result.includes('onConfirmHair?.()'),'Hair change still needs explicit confirmation');
});


test('Thai government result edits only native insignia layers directly on picture, desktop and touch',async()=>{
 const ui=await read('src/thai-mobile-journey.jsx');
 const drag=await read('src/result-insignia-drag.jsx');
 const css=await read('src/result-insignia-drag.css');
 const chooser=await read('src/government-insignia-chooser.jsx');
 const easy=await read('src/easy-mode.jsx');
 const studio=await read('src/studio-editor.jsx');
 assert(ui.includes('governmentResult&&resultInsignia&&<div className="thai-mobile-result-insignia-inline"'),'Only government results show the launch button and attached picker');
 assert(ui.includes("resultInsigniaOpen&&<ResultInsigniaDrag"),'Drag overlay is not present outside insignia editing');
 assert(ui.includes('handles={insigniaHandles}')&&ui.includes('onTransform={onInsigniaTransform}'));
 assert(ui.includes('thai-mobile-result-insignia-panel'),'The chooser displays only in result edit mode');
 assert(ui.includes('thai-mobile-result-tool-slot')&&ui.includes('ย้อนกลับไปแถวเครื่องมือ'),'Mobile picker replaces the original action slot with a return button');
 assert(!ui.includes('thai-result-insignia-guide'),'Remove redundant explanatory text below chooser');
 assert(chooser.includes('{!quickResult&&<header className="idprom-government-insignia-head"'),'Quick result hides title and top description, while Studio chooser retains them');
 assert(chooser.includes("{!quickResult&&<p className=\"idprom-government-insignia-help\""),'Quick result shows only actual insignia tabs and options');
 assert(css.includes('.thai-mobile-result-insignia-inline > .thai-mobile-result-insignia-panel'),'Picker is visually attached directly under button');
 assert(css.includes('border-top:0;border-radius:0 0 14px 14px'),'No separated heading card or gap below action');
 assert(ui.includes('onClick={onDownload}'),'Real paid output path remains');
 assert(ui.includes('เปลี่ยนทรงผม')&&ui.includes('เปลี่ยนรูปใหม่'),'Other requested result actions remain');
 assert(drag.includes('onPointerDown={begin}')&&drag.includes('onPointerMove={move}'),'Touch and mouse pointer gestures share one interface');
 assert(drag.includes('onPointerCancel={finish}')&&drag.includes('onLostPointerCapture='),'Gesture cancellation is accounted for');
 assert(drag.includes("data-insignia-resize"),'Resize grip is on the image');
 assert(drag.includes('after.dist/before.dist'),'Pinch to resize works without sliders');
 assert(drag.includes("['nw','ne','se','sw'].map("),'All four Studio-style corner resize controls are present');
 assert(drag.includes('studioDistance(after.center)/studioDistance(before.center)'),'Drag scaling follows Studio-style radial distance from the asset center');
 assert(drag.includes('g.center'),'Scale keeps the selected insignia center fixed');
 assert(!drag.includes('>↘</span>'),'Oversized purple diagonal resize bubble is removed');
 assert(css.includes('.thai-result-insignia-studio-dot')&&css.includes('#a8fff1'),'Selection uses Studio aqua dots');
 assert(css.includes('.thai-result-insignia-corner-nw')&&css.includes('.thai-result-insignia-corner-se'),'All four corner grips have hit areas');
 assert(css.includes('border:1.5px solid transparent'),'Unselected assets have no distracting outlines');
 assert(css.includes('touch-action:none')&&css.includes('thai-result-insignia-grip'),'Handles render above actual photo on mobile');
 assert(!drag.includes('type="range"')&&!css.includes('input[type="range"]'),'No insignia adjustment slider is introduced');
 assert(chooser.includes('quickResult')&&chooser.includes("...(onRealDetails?[['details','กระดุม/บ่า']]:[])"),'Native garment details have their own reversible control when available');
 assert(studio.includes('resultInsigniaDirect:true'),'Quick chooser creates the real Studio asset, not a fake overlay');
 assert(studio.includes('resultInsigniaHandles=governmentResult&&easyMode?layers.filter'),'Only actual editable insignia receive handles');
 assert(studio.includes("id:'collar-'+entry.side"),'Each collar pin gets its own on-photo drag handle');
 assert(studio.includes("id==='collar-left'||id==='collar-right'"),'Collar pin transforms are independent of the other pin');
 assert(studio.includes("sceneToLayer(layer,{x:450+dx,y:600+dy})"),'Touch and mouse offsets use the original Studio affine transform');
 assert(drag.includes("owningId=grip?.closest?.('[data-kind]')"),'Resize grip outside a small pin outline stays touchable');
 assert(studio.includes('resultInsigniaTransform=(id'),'The gestures modify actual native editor layers');
 assert(studio.includes('state.current=next;setLayers(next);setRevision(v=>v+1)'),'Export/source state gets gesture transforms');
 assert(studio.includes('flushTransforms();remember()'),'Edits are stored in Studio Undo');
 assert(studio.includes('resultInsigniaDirect)&&governmentResult'),'Only this result can use a manual fallback when auto-placement cannot measure the jacket');
 assert(easy.includes('onInsigniaTransform={onInsigniaTransform}'),'Connected EasyMode forwards the real callbacks');
 assert(!ui.includes("setSection('insignia')"),'No separate adjustment screen is opened');
});


test('Thai upload is one central action and Step 2 enforces gender, hair, outfit sequence',async()=>{
 const home=await read('src/idprom-simple-home.jsx');
 const homeCss=await read('src/idprom-simple-flow.css');
 const ui=await read('src/thai-mobile-journey.jsx');
 const css=await read('src/thai-mobile-journey.css');
 const upload=home.slice(home.indexOf('idprom-simple-upload-step'));
 assert(upload.includes('<h1>อัปโหลดรูปของคุณ</h1>'));
 assert(upload.includes('<h2>เพิ่มรูป</h2>'),'Title inside the card matches English Create your portrait layout');
 assert(upload.includes('idprom-simple-upload-submit">อัปโหลดรูป</button>'),'Single English-style primary upload button is inside the card');
 assert(upload.includes('<svg viewBox="0 0 24 24"'),'Cloud upload icon replaces plain upward arrow');
 assert(upload.includes('idprom-simple-upload-hint'),'Single concise image hint is beneath the purple button');
 assert(!upload.includes('className="idprom-simple-primary"'),'No duplicate upload button below the card');
 assert(upload.includes('onClick={onUpload}'),'Central upload uses actual file picker');
 assert(!upload.includes('เลือกรูปและไปต่อ')&&!upload.includes('เลือกรูปจากเครื่อง'),'Duplicated upload buttons were removed');
 assert(!upload.includes('เลือกรูปหน้าตรง ใบหน้าชัดเจน')&&!upload.includes('ไม่จำเป็นต้องใส่ชุด'),'Extra upload instructions were removed');
 assert(homeCss.includes('.idprom-simple-upload-step > .idprom-simple-upload-card'),'Central upload is responsive without changing Welcome');
 assert(homeCss.includes('width:min(100%,425px);height:auto;min-height:272px'),'Same compact card proportions as English screen');
 assert(homeCss.includes('width:100%;max-width:310px;min-height:47px'),'Purple upload button spans card center just like screenshot');
 assert(homeCss.includes('.idprom-simple-upload-step .idprom-upload-glyph'),'Upload icon has matching lilac circular background');
 assert(homeCss.includes('background:#fff;color:#24143f;cursor:default'),'The dashed card is not incorrectly a giant click button');
 const page=ui.slice(ui.indexOf('thai-mobile-choice-gender'),ui.indexOf('thai-mobile-choice-footer'));
 assert(page.includes("['female','male'].map"),'Gender selector always appears on Step 2');
 assert(!page.includes('!photoTypeSelected&&<div className="thai-mobile-choice-panel thai-mobile-choice-gender"'),'Gender selector is not hidden after selection');
 assert(page.includes('onClick={()=>selectGender(v)}'),'Changing gender resets downstream decisions');
 assert(ui.includes('setDraftHair(\'\');setSelectedStyle(false);setOutfitChosen(false);'),'Changing gender must invalidate hair and outfit choices');
 assert(ui.includes('const hairUnlocked=Boolean(photoTypeSelected)'));
 assert(ui.includes('const suitUnlocked=Boolean(photoTypeSelected&&selectedStyle&&draftHair)'));
 assert(ui.includes('const chooseHair=h=>{if(!h||(!hasResult&&!hairUnlocked)||busy)return'),'Hair callback is guarded');
 assert(ui.includes('const chooseSuit=t=>{if(!t||t.locked||!suitUnlocked||busy||suitLoading)return'),'Outfit callback rejects locked outfits and preserves step/busy guards');
 assert(page.includes('aria-disabled={!hairUnlocked}')&&page.includes('aria-disabled={!suitUnlocked}'),'Locked panels are announced');
 assert(page.includes('disabled={busy||!hairUnlocked}'),'Hair selection disabled before gender');
 assert(page.includes('disabled={!suitUnlocked||busy}'),'Outfit categories disabled before hair');
 assert(page.includes('disabled={Boolean(t.locked)||busy||!suitUnlocked||suitLoading'),'Outfit options retain step/busy guards and reject unpaid choices');
 assert(page.includes('disabled={!hairUnlocked||busy}'),'View-all hair option locked');
 assert(page.includes('disabled={!suitUnlocked||busy}'),'View-more outfit option locked');
 assert(ui.includes('outfitChosen&&currentSuit===t.template'),'A previously default outfit is not mistaken for an explicit new selection');
 assert(ui.includes('const outfitReady=Boolean(photoTypeSelected&&selectedStyle&&draftHair&&outfitChosen&&chosenOutfitTemplate===currentSuit&&currentSuit)'),'Create requires an explicitly chosen and actually applied outfit');
 assert(ui.includes('sourcePreview&&outfitReady&&ready&&!busy'),'Create remains locked until outfit is ready');
 assert(ui.includes("setChosenOutfitTemplate(t.template)"),'Click stores the exact new suit, not the previous default');
 assert(ui.includes("chosenOutfitTemplate!==currentSuit"),'Guard prevents stale outfit from being submitted before applying a new suit');
 assert(ui.includes('disabled={!canSubmit} onClick={create}'),'Create is not clickable early');
 assert(css.includes('thai-mobile-choice-locked')&&css.includes('cursor:not-allowed'),'Locked choices are visible but inactive');
 const studio=await read('src/studio-editor.jsx');
 assert(studio.includes('onSelectPhotoType={selectEasyPhotoType}')&&studio.includes('setEasyPhotoTypeSelected(false)'),'Original gender state is connected and reset on new photo');
});

test('Thai Step 2 circular background choices use original Studio export layer with no extra AI call',async()=>{
 const flow=await read('src/thai-mobile-journey.jsx');
 const easy=await read('src/easy-mode.jsx');
 const studio=await read('src/studio-editor.jsx');
 const css=await read('src/thai-mobile-journey.css');
 const options=await read('src/main.jsx');
 assert(options.includes("const BACKGROUND_OPTIONS=[{id:'default'"),'Existing available photo background catalogue is reused');
 assert(flow.includes("backgrounds=[],currentBackground='',onBackground"),'Existing background props are attached to Thai Step 2');
 assert(easy.includes('backgrounds={backgrounds} currentBackground={currentBackground} onBackground={onBackground}'),'The Easy view forwards real Studio background choices');
 assert(studio.includes("onBackground={option=>selectAsset('background',option)}"),'The background swatches use the existing native background layer and export workflow');
 const choice=flow.slice(flow.indexOf('thai-mobile-choice-gender'),flow.indexOf('thai-mobile-choice-footer'));
 assert(choice.includes('thai-mobile-choice-background-panel'),'Background follows existing gender, hair and outfit controls');
 assert(choice.indexOf('thai-mobile-choice-outfit-panel')<choice.indexOf('thai-mobile-choice-background-panel'),'Background is beneath outfit, not before it');
 assert(choice.includes('backgrounds.filter(b=>bgPalette[b.id])'),'Use only grounded palette colours and original asset references');
 assert(choice.includes('role="group" aria-label="สีพื้นหลังสำหรับรูปที่สร้าง"'),'Accessible compact swatch group');
 assert(choice.includes('aria-pressed={(draftBackground||currentBackground)===b.id}'),'Currently selected background is visibly announced');
 assert(choice.includes('disabled={!outfitReady||busy||suitLoading}'),'Do not skip gender, hair, or outfit sequence');
 assert(flow.includes('const pickBackground=option=>'),'Swatch selection is guarded');
 assert(flow.includes('onBackground?.(option)'),'Colour selection reaches the real native compositing layer');
 assert(flow.includes("setChosenOutfitTemplate('');setDraftBackground('')"),'Replacing a photo clears outdated palette selection');
 assert(flow.includes("setDraftBackground('');"),'Gender change also clears previous colour selection');
 assert(!choice.includes('type="color"'),'The mobile card is small preset circles, not a large colour tool');
 assert(css.includes('thai-mobile-choice-background-dot')&&css.includes('border-radius:50%'),'Swatches are small circles');
 assert(css.includes('@media(max-width:720px)'),'Swatches remain accessible on phone');
 const process=studio.slice(studio.indexOf('const processPhoto=async('),studio.indexOf('const openEnglishManual=',studio.indexOf('const processPhoto=async(')));
 assert(process.includes("let next=previous.filter(l=>l.id!==oldHead?.id&&l.id!==sourceLayerRef.current"),'New AI generations retain existing background layers from the user selection');
 assert(!flow.slice(flow.indexOf('const pickBackground=option=>'),flow.indexOf('const selectGender=v=>')).includes('onGenerateHair'),'Colour selection does not charge for an AI call');
});

test('Thai hairstyle picker replaces the old short free option with the existing female style 2 once',async()=>{
 const {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS}=await import('../hairstyle-catalog.js');
 const main=await read('src/main.jsx'),ui=await read('src/thai-mobile-journey.jsx');
 const menuStart=main.indexOf('const BASIC_MALE_HAIR_IDS='),menuEnd=main.indexOf('const JOB_UNIFORMS=[',menuStart);
 assert(menuStart>=0&&menuEnd>menuStart);
 const ordered=new Function('PRODUCTION_HAIR_CATALOG','THAI_FREE_FEMALE_HAIR_IDS',main.slice(menuStart,menuEnd)+'return STUDIO_FEMALE_HAIR_OPTIONS;')(PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS);
 assert.deepEqual(THAI_FREE_FEMALE_HAIR_IDS,['seedream-14','seedream-16','seedream-41']);
 assert.deepEqual(ordered.slice(0,3).map(h=>h.id),THAI_FREE_FEMALE_HAIR_IDS);
 assert.equal(ordered.filter(h=>h.id==='seedream-41').length,1,'Only one card for style 2');
 assert(!ordered.some(h=>h.id==='seedream-27'),'Previously free short/gathered option is replaced in the picker');
 for(const id of ['standard-female-half-up','standard-female-gathered','standard-female-straight']){
  assert(!ordered.some(h=>h.id===id),'Removed style must not appear: '+id);
  assert(!PRODUCTION_HAIR_CATALOG.some(h=>h.id===id),'Removed style must not remain in the selectable catalog');
 }
 assert.match(main,/const BASIC_FEMALE_HAIR_IDS=THAI_FREE_FEMALE_HAIR_IDS/);
 assert.match(ui,/displayHairOptions\.map\(h=>/);
 assert.match(ui,/onClick=\{\(\)=>chooseHair\(h\)\}/);
 assert(!ui.includes('HairExample')&&!ui.includes('ORIGINAL_FEMALE_PICKER_FACE'),'Old fake-face preview composite removed');
});
test('new free style 2 is the existing website asset and both Thai access gates accept it without Diamond',async()=>{
 const {readFile:readBinary}=await import('node:fs/promises');
 const {PRODUCTION_HAIR_CATALOG,THAI_FREE_FEMALE_HAIR_IDS}=await import('../hairstyle-catalog.js');
 const matching=PRODUCTION_HAIR_CATALOG.filter(h=>h.id==='seedream-41');
 assert.equal(matching.length,1);
 assert.equal(matching[0].name,'ทรงผมหญิง 2');
 assert.equal(matching[0].src,'/assets/seedream-hairstyles/previews/41.webp');
 const img=await readBinary(new URL('../public'+matching[0].src,import.meta.url));
 assert(img.length>500);
 assert.equal(img.toString('ascii',0,4),'RIFF');
 assert.equal(img.toString('ascii',8,12),'WEBP');
 assert(THAI_FREE_FEMALE_HAIR_IDS.includes(matching[0].id));
 const server=await read('server.js'),studio=await read('src/studio-editor.jsx'),mobile=await read('src/thai-mobile-journey.jsx');
 assert(server.includes("chosen.gender==='female'&&!THAI_FREE_FEMALE_HAIR_IDS.includes(chosen.id)"));
 assert(studio.includes("femaleHair.some(h=>h.id===id)&&!THAI_FREE_FEMALE_HAIR_IDS.includes(id)"));
 assert(!studio.includes("h.id?.startsWith('standard-female-')"));
 assert(!mobile.includes('thai-standard-hair-preview'));
});

test('Thai Easy Mode insignia is easy to touch, moves instead of resizing under overlapping grips and commits the final drag',async()=>{
 const {easyInsigniaHit,easyInsigniaGestureMode}=await import('../src/result-insignia-hit.js');
 const handles=[
  {id:'collar-left',box:{x:195,y:280,w:33,h:22}},
  {id:'collar-right',box:{x:330,y:280,w:33,h:22}}
 ];
 assert.equal(easyInsigniaHit(handles,{x:213,y:291},300,400)?.id,'collar-left');
 assert.equal(easyInsigniaHit(handles,{x:344,y:290},300,400)?.id,'collar-right');
 assert.equal(easyInsigniaHit(handles,{x:700,y:700},300,400),null,'Remote touch must not select any marker');
 assert.equal(easyInsigniaGestureMode(true,{x:213,y:291},handles[0].box),'move','Touching badge body always moves');
 assert.equal(easyInsigniaGestureMode(true,{x:184,y:273},handles[0].box),'resize','Touching outside corner still resizes');
 const drag=await read('src/result-insignia-drag.jsx'),ui=await read('src/thai-mobile-journey.jsx');
 assert(drag.includes("from './result-insignia-hit.js'"));
 assert(drag.includes('schedule(g.id,{dx,dy,scaleRatio})'),'Pointer events must be combined into display-frame updates');
 assert(drag.includes('flush();gesture.current=null'),'Release applies last movement before save');
 assert(ui.includes('<ResultInsigniaDrag handles={insigniaHandles}'),'Only Easy result photo uses this component');
 const studio=await read('src/studio-editor.jsx');
 assert(studio.includes('const resultInsigniaTransform=(id,{dx=0,dy=0,scaleRatio=1}={})=>'),'Existing layer transformation stays unchanged');
});

test('same uploaded portrait + exact outfit/hair/finish restores accepted full AI result without a second generation',async()=>{
 const {createStudioPortraitHairHistory}=await import('../src/studio-portrait-hair-history.js');
 const cache=createStudioPortraitHairHistory(3);
 const firstPhoto=new Blob(['original customer A'],{type:'image/png'});
 const secondPhoto=new Blob(['original customer A'],{type:'image/png'});
 const base={source:firstPhoto,scope:'wallet-A',template:'/suits/navy.png',
  mode:'female',hair:'seedream-14',finish:'makeup',version:'hair-prompt-v1'};
 const item={...base,master:new Blob(['original successful AI result']),lock:{templatePath:base.template},
  jobId:'job-original-14',isTrial:true};
 assert.equal(cache.find(base),null,'Unfinished generation cannot be reused');
 assert(cache.remember(item));
 assert.equal(cache.find(base)?.jobId,'job-original-14');
 assert.equal(cache.find({...base,source:secondPhoto}),null,'Even identical bytes from a different upload cannot leak old pixels');
 assert.equal(cache.find({...base,scope:'wallet-B'}),null,'No reuse across accounts');
 assert.equal(cache.find({...base,template:'/suits/white.png'}),null,'Another outfit is a new combination');
 assert.equal(cache.find({...base,hair:'seedream-16'}),null,'Another hairstyle is a new combination');
 assert.equal(cache.find({...base,finish:'natural'}),null,'Another makeup choice is a new combination');
 assert.equal(cache.find({...base,version:'hair-prompt-v2'}),null,'Changed generation policy invalidates old result');
 const newStyle={...base,hair:'seedream-16'};
 cache.remember({...item,...newStyle,jobId:'job-new-16'});
 assert.equal(cache.find(base)?.jobId,'job-original-14','Returning to previous hairstyle restores its original successful AI job');
 assert.equal(cache.find(newStyle)?.jobId,'job-new-16');
 cache.clear();
 assert.equal(cache.find(base),null,'Switching uploads clears stored results');
});

test('Thai full-outfit haircut returns a confirmed cached result before credits or AI on exact reselection',async()=>{
 const main=await read('src/main.jsx'),studio=await read('src/studio-editor.jsx');
 const start=main.indexOf('const processStudioPhoto=async('),end=main.indexOf('const applyStudioMakeup=async(',start);
 assert(start>=0&&end>start);
 const code=main.slice(start,end);
 assert(code.includes("generationOptions.creditKind==='hairstyle'&&file===firstUploadedPhotoRef.current"));
 assert(code.includes('cachedFullPortraitResult(selectedHair,portraitMode,femaleEyeStyle,template)'));
 assert(code.includes('if(cached){')&&code.includes('master=cached.master;'));
 assert(code.includes('}else{')&&code.includes('aiHead=await generate()'),'Only cache misses start the original AI job');
 assert(code.includes('cached?{lock:cached.lock}:await composePortrait'));
 assert(code.indexOf('fullPortraitHairHistoryRef.current.remember(')>code.indexOf('const commit=()=>'),'Cache must be saved only inside accepted-result commit');
 assert(code.includes('const entry=rememberHairResult'));
 assert(main.includes("source,scope:hairResultScope(),template:template||editCache.current?.lock?.templatePath"),'Only the exact original photo, account and outfit can restore');
 assert(studio.includes('const cachedSelectedResult=!firstGeneration&&!newSourcePending'));
 assert(studio.includes('&&!cachedSelectedResult){'),'Do not invoke quota fallback for cached combinations');
 assert(studio.includes('!options.recoverExistingJob&&!cachedSelectedResult'),'Do not charge or block a cached result because credits are exhausted');
 assert(studio.includes("||cachedSelectedResult))generationOptions.creditKind='hairstyle'"),'Request must enter cache-aware pathway');
});


test('cached full-outfit hair bypasses quota fallback and all request paths resolve the same garment',async()=>{
 const studio=await read('src/studio-editor.jsx'),main=await read('src/main.jsx');
 assert(studio.includes("!canRestoreHair(id,mode,finish)&&await thaiManualAfterOutfitQuota()"));
 assert(studio.includes("await onChangeHair(id,mode,finish,state.current.find(l=>layerKind(l)==='suit')?.templatePath||placementRef.current?.templatePath||head.generatedOutfitTemplate||'',{restoreOnly})"));
 const restored=main.slice(main.indexOf('const rememberRestoredHairResult='),main.indexOf('const restoreHairResultRights='));
 assert(restored.includes('fullPortraitHairHistoryRef.current.remember('),'Accepted initial/reopened full portrait is remembered before switching away');
 assert(restored.includes('template=head.generatedOutfitTemplate||editCache.current?.lock?.templatePath'));
 assert(main.includes("version:JSON.stringify([hairResultKey(id,mode,finish,template),THAI_COLLARLESS_VERSION,'complete-garment-rear-hair-v2'])"));
});
