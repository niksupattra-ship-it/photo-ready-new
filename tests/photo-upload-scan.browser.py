"""Local photo-only checks: actual models, scan states, and rejection preserves Studio."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SCAN_BASE','http://127.0.0.1:5202')
OUT=Path('/tmp/idprom-upload-scan');OUT.mkdir(exist_ok=True)
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':900})
 ai=[];page.on('request',lambda r:ai.append(r.url) if '/api/ai-jobs' in r.url and r.method=='POST' else None)
 page.goto(BASE);page.wait_for_timeout(500)
 actual=page.evaluate('''async()=>{
 const {inspectUploadPortrait}=await import('/src/photo-upload-scan.js');const results=[];
 for(const path of ['/assets/home-previews/easy-original-v20261031.webp','/assets/home-previews/government-uniforms--female-operational-example.webp','/assets/home-previews/government-uniforms--male-academic-example.webp']){const blob=await(await fetch(path)).blob();results.push(await inspectUploadPortrait(blob))}
 const im=new Image();im.src='/assets/home-previews/government-uniforms--female-operational-example.webp';await im.decode();
 for(const crop of ['head','chest']){const c=document.createElement('canvas');const y=crop==='head'?im.height*.27:0;const h=crop==='head'?im.height-y:im.height*.52;c.width=im.width;c.height=h;c.getContext('2d').drawImage(im,0,y,im.width,h,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r));results.push(await inspectUploadPortrait(b))}
 const {runPhotoScanWorker}=await import('/src/photo-scan-worker-client.js');
 const shirt=new Image();shirt.src='/assets/home-previews/easy-original-v20261031.webp';await shirt.decode();
 const evidence=await runPhotoScanWorker(await createImageBitmap(shirt)),a=evidence.pose[11],b=evidence.pose[12],fh=Math.max(...evidence.faces[0].map(p=>p.y))-Math.min(...evidence.faces[0].map(p=>p.y));
 const lo=Math.max(0,Math.min(a.x,b.x)-.008),hi=Math.min(1,Math.max(a.x,b.x)+.008),end=Math.min(1,Math.max(a.y,b.y)+fh*.35);
 const tight=document.createElement('canvas');tight.width=Math.round((hi-lo)*shirt.width);tight.height=Math.round(end*shirt.height);tight.getContext('2d').drawImage(shirt,lo*shirt.width,0,(hi-lo)*shirt.width,end*shirt.height,0,0,tight.width,tight.height);
 results.push(await inspectUploadPortrait(await new Promise(r=>tight.toBlob(r))));
 const small=document.createElement('canvas');small.width=174;small.height=242;small.getContext('2d').drawImage(im,0,0,174,242);results.push(await inspectUploadPortrait(await new Promise(r=>small.toBlob(r))));
 return results;
 }''')
 assert all(x['status']=='pass' for x in actual[:3]),actual
 assert actual[3]['status']=='reject' and actual[4]['status']!='pass',actual
 assert actual[5]['status']=='pass' and actual[6]['status']=='pass',actual
 print(json.dumps(actual,ensure_ascii=False))
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':900 if width>600 else 844})
  page.evaluate('''async()=>{const {scanNewPortrait}=await import('/src/photo-upload-scan.js');window.scanFinish=null;window.scanResult=null;const blob=await(await fetch('/assets/home-previews/easy-original-v20261031.webp')).blob();window.scanNewPortrait=scanNewPortrait;window.scanBlob=blob;scanNewPortrait(blob,{inspect:(file,options)=>{window.scanProgress=options.onProgress;return new Promise(r=>window.scanFinish=r)}}).then(v=>window.scanResult=v)}''')
  dialog=page.get_by_role('dialog');dialog.wait_for();page.evaluate("scanProgress(45,'กำลังตรวจใบหน้า')");assert page.get_by_role('progressbar').get_attribute('aria-valuenow')=='45';assert page.locator('.photo-upload-scan-beam').is_visible()
  assert dialog.bounding_box()['width']<=width
  page.screenshot(path=str(OUT/f'scanning-{width}.png'))
  page.evaluate("scanFinish({status:'reject',issues:['ภาพตัดสูงเกินไป กรุณาให้เห็นช่วงอก'],uncertain:[]})")
  page.get_by_text('กรุณาใช้รูปที่เห็นใบหน้า คอ ไหล่ และอกบน',exact=True).wait_for();assert page.locator('.photo-upload-scan-actions button').count()==3
  page.screenshot(path=str(OUT/f'rejected-{width}.png'))
  page.get_by_role('button',name='เปลี่ยนรูปใหม่',exact=True).click();page.wait_for_function('scanResult===false')
  page.evaluate("scanResult=null;void scanNewPortrait(scanBlob,{inspect:async()=>{throw Error('offline')}}).then(v=>scanResult=v)")
  page.get_by_text('ยังตรวจรูปไม่สำเร็จ',exact=True).wait_for();assert page.locator('.photo-upload-scan-actions button').count()==3
  assert not page.get_by_role('button',name='ใช้รูปนี้ต่อ',exact=True).count()
  page.get_by_role('button',name='ปิด',exact=True).click();page.wait_for_function('scanResult===false')
  page.evaluate("scanResult=null;void scanNewPortrait(scanBlob,{inspect:async()=>({status:'uncertain',uncertain:['ยังยืนยันไหล่ทั้งสองข้างไม่ได้']})}).then(v=>scanResult=v)")
  page.get_by_text('ยังยืนยันตำแหน่งในรูปได้ไม่ครบ',exact=True).wait_for()
  page.get_by_role('button',name='ใช้รูปนี้ต่อ',exact=True).click();page.wait_for_function('scanResult===true')
  page.evaluate("scanResult=null;void scanNewPortrait(scanBlob,{inspect:async()=>({status:'pass'})}).then(v=>scanResult=v)")
  page.wait_for_function('scanResult===true')
 # Actual invalid candidate in the existing Studio upload handler must not
 # replace the previously accepted source or start an AI job.
 page.goto(BASE+'/scripts/fixtures/thai-ai-edit.html?fresh=1&easy=1')
 page.locator('.studio-canvas-wrap').first.wait_for(state='attached') if page.locator('.studio-canvas-wrap').count() else page.wait_for_timeout(1500)
 page.wait_for_timeout(800)
 before=page.evaluate("[...document.querySelectorAll('canvas')].map(c=>c.toDataURL())")
 before_source=page.locator('.thai-mobile-choice-photo-wrap img').get_attribute('src')
 inputs=page.locator('input[type=file][accept*="image/heic"]')
 inputs.set_input_files({'name':'invalid.png','mimeType':'image/png','buffer':(ROOT/'public/assets/background.jpg').read_bytes()})
 page.get_by_text('กรุณาใช้รูปที่เห็นใบหน้า คอ ไหล่ และอกบน',exact=True).wait_for()
 with page.expect_file_chooser() as chooser:
  page.get_by_role('button',name='เปลี่ยนรูปใหม่',exact=True).click()
 page.wait_for_timeout(500)
 assert page.evaluate("[...document.querySelectorAll('canvas')].map(c=>c.toDataURL())")==before,'Rejected upload changed Studio pixels'
 assert page.evaluate('thaiAiCalls.length')==0
 assert page.locator('.thai-mobile-choice-photo-wrap img').get_attribute('src')==before_source
 chooser.value.set_files(str(ROOT/'public/assets/home-previews/easy-original-v20261031.webp'))
 page.locator('.photo-upload-scan').wait_for()
 page.locator('.photo-upload-scan').wait_for(state='detached')
 page.wait_for_function("document.querySelectorAll('canvas').length>0")
 page.wait_for_timeout(500)
 page.screenshot(path=str(OUT/'accepted-studio.png'))
 assert page.locator('.thai-mobile-choice-photo-wrap img').get_attribute('src')!=before_source,'Passed source upload was not committed'
 assert page.evaluate('thaiAiCalls.length')==0,'Scanning submitted an AI job'
 assert not ai,ai
 browser.close()
