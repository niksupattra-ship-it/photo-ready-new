"""Original makeup/no-makeup work while the additional soft option is hidden.
Actual Studio clicks; all service requests blocked and callbacks simulated.
"""
from playwright.sync_api import sync_playwright,expect
import json
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [390,1440]:
   p=b.new_page(viewport={'width':width,'height':1000},has_touch=width<600);errors=[];services=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/' in r.request.url:services.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?lang='+lang)
   p.wait_for_function('!!window.separateMakeup?.current')
   initial=p.locator('#initial-finish-fixture');assert initial.locator('button').count()==2;assert initial.locator('.idprom-face-compare__additional').count()==0
   initial.locator('button').nth(0).click();p.wait_for_function("window.initialFinish==='korean-rosy-v1'");initial.locator('button').nth(1).click();p.wait_for_function("window.initialFinish==='natural'");initial.evaluate("el=>el.style.display='none'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   menu=p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup' if lang=='en' else 'เมคอัพ',exact=True);menu.click()
   assert p.locator('.studio-additional-ai-makeup').count()==0;assert p.locator('.studio-makeup-options button').count()==5
   originals=p.locator('.studio-original-makeup-choices button');assert originals.count()==2
   for i in range(2):expect(originals.nth(i)).to_be_enabled()
   originals.nth(0).click();p.wait_for_function("!separateMakeup.current().layers.find(l=>l.kind==='head').makeupStyles?.look")
   assert p.evaluate('separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===0');expect(originals.nth(0)).to_have_attribute('aria-pressed','true')
   originals.nth(1).click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='natural'")
   assert p.evaluate("separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===1&&separateMakeupCalls.hair[0].finish==='natural'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled");menu.click();expect(originals.nth(1)).to_have_attribute('aria-pressed','true')
   assert not errors,errors;assert not services,services
   results.append({'language':lang,'width':width,'softChoiceHidden':True,'initialChoicesWork':True,'originalChoicesWork':True,'serviceRequests':0});p.close()
 b.close()
print(json.dumps(results,indent=2))
