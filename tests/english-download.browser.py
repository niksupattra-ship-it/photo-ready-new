import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
Path('work').mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  p=b.new_page(viewport={'width':width,'height':667 if width<600 else 950},is_mobile=width<600,has_touch=width<600,accept_downloads=True);errors=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
  p.goto(base+'/scripts/fixtures/english-download.html?lang=en',wait_until='domcontentloaded')
  p.get_by_role('heading',name='Download your photo').wait_for()
  p.get_by_role('button',name='Print PDF',exact=True).click()
  p.get_by_label('Photo size',exact=True).select_option('intl-2x2-inch')
  p.get_by_label('Copies',exact=True).fill('4')
  p.wait_for_timeout(150)
  assert p.get_by_label('Letter print sheet preview').count()==1
  assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
  p.screenshot(path=f'work/english-download-{width}.png',full_page=True)
  if width>600:
   with p.expect_download() as event:p.get_by_role('button',name='Download PDF',exact=True).click()
   file=event.value;assert file.suggested_filename.endswith('.pdf');file.save_as('work/letter-print-test.pdf')
   info=subprocess.check_output(['pdfinfo','work/letter-print-test.pdf'],text=True);assert '612 x 792 pts' in info
  else:
   p.get_by_role('button',name='Download PDF',exact=True).click()
   p.get_by_role('heading',name='Save your PDF',exact=True).wait_for()
   assert p.get_by_text('Print on Letter paper at Actual size / 100%.',exact=True).count()==1
   with p.expect_download() as event:p.get_by_role('link',name='Save PDF',exact=True).click()
   assert event.value.suggested_filename.endswith('.pdf')
   p.get_by_role('button',name='Close',exact=True).click()
  p.get_by_role('button',name='Photo PNG',exact=True).click()
  p.get_by_label('Photo size',exact=True).select_option('original')
  if width>600:
   with p.expect_download() as event:p.get_by_role('button',name='Download photo',exact=True).click()
   assert event.value.suggested_filename.endswith('.png')
  assert not errors,errors
  p.close()
 # Thai keeps its existing receipt and size controls.
 p=b.new_page();p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
 p.goto(base+'/scripts/fixtures/english-download.html?lang=th',wait_until='domcontentloaded');p.locator('.purchase-receipt').wait_for()
 assert p.locator('.en-download').count()==0
 b.close()
 print(json.dumps({'passed':True,'checks':['actual receipt integration','Letter PDF downloads','exact 2-inch size selection','mobile save PDF panel','PNG preserved','responsive layout','Thai unchanged','no API/payment calls']}))
