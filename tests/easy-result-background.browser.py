"""Change the actual finished-photo background layer without another AI call."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('REFIT_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/government-result-insignia.html?gender=female&fullbody=1&labComplete=1&backgrounds=1')
  p.wait_for_function('window.insigniaFixture?.snapshot()?.layers.some(l=>l.kind===\'head\')')
  old=p.evaluate("insigniaFixture.snapshot().layers.find(l=>l.kind==='head').source")
  if width<=720:p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='พื้นหลัง',exact=True).click()
  panel=p.get_by_role('group',name='สีพื้นหลังรูปที่สร้างแล้ว',exact=True);expect(panel).to_be_visible();assert panel.get_by_role('button').count()==5
  dot=panel.locator('.thai-mobile-choice-background-dot').first
  assert dot.evaluate('(e)=>getComputedStyle(e).borderRadius')=='50%'
  panel.get_by_role('button',name='ขาว',exact=True).click()
  p.wait_for_function("insigniaFixture.snapshot().layers.find(l=>l.kind==='background')?.assetId==='white'")
  expect(panel.get_by_role('button',name='ขาว',exact=True)).to_have_attribute('aria-pressed','true')
  assert p.evaluate("insigniaFixture.snapshot().layers.find(l=>l.kind==='head').source")==old
  assert p.evaluate('insigniaFixture.aiCalls+insigniaFixture.paymentCalls')==0;assert not errors,errors
  p.screenshot(path='/tmp/easy-result-background-'+str(width)+'.png')
  print(json.dumps({'width':width,'roundChoices':5,'finishedBackgroundLayerChanged':True,'headPixelsUnchanged':True,'providerCalls':0}),flush=True);p.close()
 b.close()
