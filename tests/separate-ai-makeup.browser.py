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
   legacy=lang=='th'and width==390
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?lang='+lang+('&legacy=1'if legacy else''))
   p.wait_for_function('!!window.separateMakeup?.current');p.locator('#initial-finish-fixture .idprom-face-compare__additional').click();p.wait_for_function("window.initialFinish==='soft-rosy-v1'");expect(p.locator('#initial-finish-fixture .idprom-face-compare__additional')).to_have_attribute('aria-pressed','true');assert p.locator('#initial-finish-fixture button').count()==3;p.locator('#initial-finish-fixture').evaluate("el=>el.style.display='none'");p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True).click()
   originals=p.locator('.studio-original-makeup-choices');extra=p.locator('.studio-additional-ai-makeup');assert originals.get_by_role('button').count()==2;assert extra.get_by_role('button').count()==1
   original=originals.get_by_role('button').nth(0);natural=originals.get_by_role('button').nth(1);new=extra.get_by_role('button')
   for button in [original,natural,new]:
    expect(button).to_be_enabled();box=button.bounding_box();drawer=p.locator('.studio-picker-drawer').bounding_box();assert box['y']>=drawer['y']and box['y']+box['height']<=drawer['y']+drawer['height']+1,'Original/new choice clipped'
   assert original.get_attribute('aria-pressed')=='false';assert new.get_attribute('aria-pressed')=='false'
   original.click();p.wait_for_function("!separateMakeup.current().layers.find(l=>l.kind==='head').makeupStyles?.look")
   assert p.evaluate("separateMakeup.current().layers.find(l=>l.kind==='head').source===separateMakeupBase");assert p.evaluate('separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===0');assert original.get_attribute('aria-pressed')=='true'
   new.click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='soft-rosy-v1'");p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   assert p.evaluate("separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===1&&separateMakeupCalls.hair[0].finish==='soft-rosy-v1'")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True).click();expect(p.locator('.studio-additional-ai-makeup button')).to_have_attribute('aria-pressed','true')
   natural.click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='natural'")
   assert p.evaluate('separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===2');assert p.evaluate("separateMakeupCalls.hair[1].finish==='natural'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True).click();expect(p.locator('.studio-original-makeup-choices button').nth(1)).to_have_attribute('aria-pressed','true')
   assert not errors,errors;assert not services,services
   results.append({'language':lang,'width':width,'legacyDraft':legacy,'originalButtonsVisibleAndEnabled':True,'newFinishIndependent':True,'initialChoiceWorks':True,'samePortraitPipeline':True,'restoreOriginalWithoutAi':True,'newAiOnlyWhenChosen':True,'originalNoMakeupWorks':True});p.close()
 b.close()
print(json.dumps(results,indent=2))
