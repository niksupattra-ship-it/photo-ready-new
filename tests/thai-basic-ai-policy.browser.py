"""Real Studio UI with inert provider callbacks; never submits customer AI or payments."""
import json,os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('BASIC89_BASE','http://127.0.0.1:5202')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,gender in [(1440,'female'),(390,'male')]:
  page=b.new_page(viewport={'width':width,'height':1100});errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(BASE+'/scripts/fixtures/government-result-insignia.html?studio=1&fullbody=1&basic89=1&gender='+gender,wait_until='domcontentloaded')
  if width<600:page.get_by_role('button',name='ชุด',exact=True).click()
  expect(page.locator('.english-outfit-ai')).to_be_disabled(timeout=30000)
  expect(page.get_by_text('โปร 89 ใช้ AI เปลี่ยนได้เฉพาะทรงผมฟรี',exact=False).first).to_be_visible()
  page.get_by_role('button',name='เลือกชุด ชุดข้าราชการ',exact=True).click()
  page.wait_for_function('insigniaFixture.snapshot().layers.some(l=>l.kind==="suit"&&l.visible)')
  assert page.evaluate('insigniaFixture.aiCalls')==0
  page.get_by_role('button',name='ทรงผม',exact=True).click()
  page.get_by_role('button',name='เลือกทรงผมหญิง ฟรีผมหญิง' if gender=='female' else 'เลือกทรงผมชาย ฟรีผมชาย',exact=True).click()
  page.get_by_role('button',name='สร้างภาพ',exact=True).click()
  page.wait_for_function('insigniaFixture.aiCalls===1',timeout=15000)
  assert page.evaluate('insigniaFixture.paymentCalls')==0
  assert not errors,errors
  print(json.dumps({'width':width,'gender':gender,'outfitAiDisabled':True,'nativePngNoAi':True,'freeHairReachesMockCallback':True,'realProviderCalls':0}))
  page.close()
 b.close()
