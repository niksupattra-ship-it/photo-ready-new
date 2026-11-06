"""Actual Studio clicks: original makeup, additional AI, original no-makeup.
All AI/hair callbacks are deterministic local doubles; service requests blocked.
"""
from playwright.sync_api import sync_playwright,expect
import json
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);results=[]
 for lang in ['th','en']:
  for width in [390,1440]:
   p=b.new_page(viewport={'width':width,'height':1000},has_touch=width<600);errors=[];services=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/'in r.request.url:services.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?lang='+lang)
   p.wait_for_function('!!window.separateMakeup?.current');p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True).click()
   originals=p.locator('.studio-original-makeup-choices');extra=p.locator('.studio-additional-ai-makeup');expect(originals).to_be_visible();expect(extra).to_be_visible();assert originals.get_by_role('button').count()==2;assert extra.get_by_role('button').count()==1
   original=originals.get_by_role('button').nth(0);natural=originals.get_by_role('button').nth(1);new=extra.get_by_role('button')
   for button in [original,natural,new]:
    expect(button).to_be_enabled();box=button.bounding_box();drawer=p.locator('.studio-picker-drawer').bounding_box();assert box['y']>=drawer['y']and box['y']+box['height']<=drawer['y']+drawer['height']+1,'Original/new choice clipped'
   assert original.get_attribute('aria-pressed')=='false';assert new.get_attribute('aria-pressed')=='true'
   original.click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').makeupStyles?.look!=='soft-rosy-ai-v1'")
   assert p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source===separateMakeupBase");assert p.evaluate('separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===0');assert original.get_attribute('aria-pressed')=='true'
   new.click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').makeupStyles?.look==='soft-rosy-ai-v1'");p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   assert p.evaluate('separateMakeupCalls.ai===1&&separateMakeupCalls.hair.length===0');assert original.get_attribute('aria-pressed')=='false'
   natural.click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='natural'")
   assert p.evaluate('separateMakeupCalls.ai===1&&separateMakeupCalls.hair.length===1');assert p.evaluate("separateMakeupCalls.hair[0].finish==='natural'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True).click();expect(p.locator('.studio-original-makeup-choices button').nth(1)).to_have_attribute('aria-pressed','true')
   assert not errors,errors;assert not services,services
   results.append({'language':lang,'width':width,'originalButtonsVisibleAndEnabled':True,'aiSeparate':True,'restoreOriginalWithoutAi':True,'newAiOnlyWhenChosen':True,'originalNoMakeupWorks':True});p.close()
 b.close()
print(json.dumps(results,indent=2))
