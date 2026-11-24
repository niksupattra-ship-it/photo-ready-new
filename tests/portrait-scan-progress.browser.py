import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SCAN_BASE','http://127.0.0.1:5202')
OUT=Path('/tmp/idprom-scan-progress');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 page.goto(BASE+'/scripts/fixtures/portrait-scan-processing.html')
 # A deliberately stuck real worker must not freeze requestAnimationFrame or
 # the watchdog, even when its entire thread is busy in synchronous code.
 page.route('**/portrait-scan-worker.js',lambda r:r.fulfill(content_type='text/javascript',body='self.onmessage=()=>{while(true){}};'))
 result=page.evaluate('''async()=>{const {runPhotoScanWorker}=await import('/src/photo-scan-worker-client.js');const c=new OffscreenCanvas(1,1);c.getContext('2d').fillRect(0,0,1,1);const bitmap=await createImageBitmap(c);let frames=0,active=true;const tick=()=>{frames++;if(active)requestAnimationFrame(tick)};requestAnimationFrame(tick);let code;try{await runPhotoScanWorker(bitmap,{timeoutMs:200})}catch(e){code=e.code}active=false;return {code,frames}}''')
 assert result['code']=='UPLOAD_SCAN_UNAVAILABLE' and result['frames']>1,result
 page.unroute('**/portrait-scan-worker.js')
 for width in [1280,390]:
  page.set_viewport_size({'width':width,'height':900 if width>600 else 844})
  for mode in ['easy','studio']:
   page.goto(BASE+'/scripts/fixtures/portrait-scan-processing.html?'+mode)
   bar=page.get_by_role('progressbar');bar.wait_for();assert bar.get_attribute('aria-valuenow')=='37'
   assert page.locator('.photo-upload-scan-beam').is_visible()
   page.wait_for_timeout(200);page.screenshot(path=str(OUT/f'{mode}-{width}.png'))
   page.evaluate('changeScanProgress(95)');assert bar.get_attribute('aria-valuenow')=='95'
   page.get_by_role('button',name='ยกเลิก',exact=True).click();assert page.evaluate('scanCancels')==1
 browser.close()
 print('Worker watchdog and responsive UI; Easy/Studio scan progress and cancellation passed')
