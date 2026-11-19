"""Two successive edits use one original upload and leave one coherent portrait scene."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('THAI_AI_BASE','http://127.0.0.1:5194')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  for english in [False,True]:
   for makeup in [False,True]:
    page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/api/**',lambda r:r.abort())
    page.goto(BASE+'/scripts/fixtures/repeated-outfit-hair.html?lang='+('en' if english else 'th')+'&makeup='+str(int(makeup)))
    page.wait_for_function('typeof repeatHairSnapshot.current === "function"')
    for n,hair in enumerate(['seedream-03','seedream-14'],1):
     if n==1:
      page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True).click()
      page.locator('.english-outfit-card').get_by_role('button',name='Edit with AI' if english else 'แก้ไขด้วย AI',exact=True).click()
     else:
      page.locator('.studio-bottom-choices').get_by_role('button',name='ทรงผม',exact=True).click()
     name='ผมยาวเลเยอร์' if n==1 else 'ผมแสกกลาง'
     page.locator('.studio-hair-panel button[aria-label$="'+name+'"]').click()
     page.get_by_role('button',name=('Makeup' if makeup else 'No makeup') if english else ('แต่งหน้า' if makeup else 'ไม่แต่งหน้า'),exact=True).click()
     assert page.evaluate('repeatHairCalls.length')==n-1
     page.locator('.english-inline-ai').get_by_role('button',name='Create' if english else 'สร้างภาพ',exact=True).click()
     page.wait_for_function('(n)=>repeatHairCalls.length===n',arg=n)
     page.wait_for_function('(n)=>repeatHairSnapshot.current().layers.some(l=>l.jobId===`result-${n}`)',arg=n)
     call=page.evaluate('repeatHairCalls.at(-1)')
     assert call['sameUpload'] and call['name']=='original-upload.png' and call['hair']==hair
     assert call['finish']==('makeup' if makeup else 'natural')
     assert call['options'].get('keepCurrentHair',False) is False
     ls=page.evaluate('repeatHairSnapshot.current().layers')
     assert len([l for l in ls if l.get('kind')=='head'])==1
     assert not [l for l in ls if l.get('kind') in ['hair-preview','collar','chest','ribbon'] or l.get('hairHeadId')]
     assert all(l.get('visible') is False for l in ls if l.get('kind')=='suit')
    assert not errors,errors
    print(json.dumps({'width':width,'english':english,'makeup':makeup,'originalUploadTwice':True,'onePortrait':True}),flush=True);page.close()
 browser.close()
