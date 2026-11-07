"""Select same stale original makeup, show new result, then safely select again.
Actual Studio React handlers; all provider/payment endpoints blocked.
"""
from playwright.sync_api import sync_playwright,expect
import json
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [390,1440]:
   p=b.new_page(viewport={'width':width,'height':1000},has_touch=width<600);errors=[];requests=[]
   p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/' in r.request.url:requests.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?stale=original&lang='+lang)
   p.wait_for_function('!!window.separateMakeup?.current');p.locator('#initial-finish-fixture').evaluate("el=>el.style.display='none'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   old=p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source")
   menu=p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup' if lang=='en' else 'เมคอัพ',exact=True)
   menu.click();choice=p.locator('.studio-original-makeup-choices button').nth(0);expect(choice).to_have_attribute('aria-pressed','true')
   choice.click();p.wait_for_function("separateMakeupCalls.hair.length===1&&!!separateMakeup.current().layers.find(l=>l.kind==='head').koreanRosyFinishVersion")
   assert p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source")!=old
   assert p.evaluate("separateMakeupCalls.hair[0].finish==='korean-rosy-v1'&&separateMakeupCalls.ai===0")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   menu.click();expect(choice).to_be_enabled();choice.click();p.wait_for_timeout(250)
   assert p.evaluate('separateMakeupCalls.hair.length===1&&separateMakeupCalls.ai===0')
   assert not errors,errors;assert not requests,requests
   results.append({'language':lang,'width':width,'staleFinishRefreshed':True,'newResultShown':True,'currentFinishNotRegenerated':True,'paidAiCalls':0});p.close()
 b.close()
print(json.dumps(results,indent=2))
