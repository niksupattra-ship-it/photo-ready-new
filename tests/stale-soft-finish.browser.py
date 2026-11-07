"""An existing soft-makeup head remains intact while its choice is hidden.
Switching to supported original makeup remains available without real services.
"""
from playwright.sync_api import sync_playwright,expect
import json
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [390,1440]:
   p=b.new_page(viewport={'width':width,'height':1000},has_touch=width<600);errors=[];requests=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/' in r.request.url:requests.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?stale=1&lang='+lang)
   p.wait_for_function('!!window.separateMakeup?.current');p.locator('#initial-finish-fixture').evaluate("el=>el.style.display='none'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   old=p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source")
   menu=p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup' if lang=='en' else 'เมคอัพ',exact=True);menu.click()
   assert p.locator('.studio-additional-ai-makeup').count()==0
   assert p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='soft-rosy-v1'")
   assert p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source")==old
   assert p.evaluate('separateMakeupCalls.hair.length===0&&separateMakeupCalls.ai===0')
   choice=p.locator('.studio-original-makeup-choices button').nth(0);choice.click()
   p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='korean-rosy-v1'")
   assert p.evaluate('separateMakeupCalls.hair.length===1&&separateMakeupCalls.ai===0')
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled");menu.click();choice.click()
   assert p.evaluate('separateMakeupCalls.hair.length===1')
   assert not errors,errors;assert not requests,requests
   results.append({'language':lang,'width':width,'existingSoftHeadPreserved':True,'softChoiceHidden':True,'originalMakeupSelectable':True,'serviceRequests':0});p.close()
 b.close()
print(json.dumps(results,indent=2))
