"""A mobile back gesture closes the result picker without reaching Studio's exit guard."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('REFIT_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 p=b.new_page(viewport={'width':390,'height':844})
 p.set_default_timeout(15000)
 p.route('**/api/**',lambda r:r.abort())
 p.goto(BASE+'/scripts/fixtures/government-result-insignia.html?gender=female&fullbody=1&labComplete=1&backgrounds=1')
 photo=p.get_by_label('รูปติดบัตรที่สร้างแล้ว',exact=True)
 expect(photo).to_be_visible()
 p.evaluate("window.exitBackEvents=0;window.addEventListener('popstate',event=>{if(!window.idpromResultPanelBackPending&&!event.idpromResultPanelHandled&&!document.querySelector('.thai-mobile-result-tool-panel'))window.exitBackEvents++})")
 url=p.url
 for _ in range(3):
  p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='เครื่องหมาย',exact=True).click()
  panel=p.get_by_role('region',name='เลือกเครื่องหมาย',exact=True)
  expect(panel).to_be_visible()
  assert panel.get_by_role('button',name='ย้อนกลับไปแถวเครื่องมือ').count()==0
  tabs=panel.locator('.idprom-government-insignia-tabs button')
  assert tabs.count()==4
  tops=tabs.evaluate_all('(els)=>els.map(e=>Math.round(e.getBoundingClientRect().top))')
  assert len(set(tops))==1,tops
  p.wait_for_function('Boolean(history.state?.idpromResultPanel)')
  if _==0:photo.click(position={'x':30,'y':30})
  elif _==1:p.evaluate('history.back()')
  else:
   panel.get_by_role('button',name='ปกคอ',exact=True).click()
   panel.get_by_role('button',name='มท.',exact=True).click()
   p.locator('.thai-result-insignia-interaction').click(position={'x':30,'y':30})
  expect(panel).to_have_count(0)
  expect(p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว')).to_be_visible()
  p.wait_for_function('!history.state?.idpromResultPanel')
  assert p.url==url
 assert p.evaluate('exitBackEvents')==0
 assert p.evaluate('insigniaFixture.aiCalls+insigniaFixture.paymentCalls')==0
 print(json.dumps({'photoClosesInsignia':True,'fourTabsOneRow':True,'backClosesPanelWithoutExit':True,'repeatedOpenBack':True}))
 b.close()
