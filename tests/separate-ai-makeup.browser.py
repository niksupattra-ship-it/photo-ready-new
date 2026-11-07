"""Visible makeup choices share one row; hidden soft look remains data-compatible.
Actual Studio handlers, local callback doubles, no service/provider requests.
"""
from playwright.sync_api import sync_playwright,expect
import json
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);results=[]
 for lang in ['th','en']:
  for width in [320,390,768,1440]:
   p=b.new_page(viewport={'width':width,'height':1000},has_touch=width<900);errors=[];services=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/'in r.request.url:services.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   legacy=lang=='th'and width==390
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?lang='+lang+('&legacy=1'if legacy else''))
   p.wait_for_function('!!window.separateMakeup?.current')
   initial=p.locator('#initial-finish-fixture');assert initial.get_by_role('button').count()==2;assert initial.locator('.idprom-face-compare__additional').count()==0
   initial.locator('.idprom-face-compare__option--makeup').click();p.wait_for_function("window.initialFinish==='korean-rosy-v1'")
   initial.locator('.idprom-face-compare__option--natural').click();p.wait_for_function("window.initialFinish==='natural'")
   initial.evaluate("el=>el.style.display='none'");p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   menu=p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup'if lang=='en'else'เมคอัพ',exact=True);menu.click()
   originals=p.locator('.studio-original-makeup-choices');expect(originals).to_be_visible();assert originals.get_by_role('button').count()==2
   assert p.locator('.studio-additional-ai-makeup').count()==0
   cards=p.locator('.studio-makeup-row button');assert cards.count()==5
   p.wait_for_timeout(350);boxes=cards.evaluate_all('(els)=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})');assert all(boxes);assert max(b['y']for b in boxes)-min(b['y']for b in boxes)<1,boxes
   assert all(boxes[i+1]['x']>boxes[i]['x']for i in range(4));assert len({round(b['height'])for b in boxes})==1,boxes
   assert p.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'page overflows'
   if lang=='th'and width==390:p.screenshot(path='work/hide-soft-single-row/mobile.png',full_page=True)
   for i in range(5):expect(cards.nth(i)).to_be_enabled()
   originals.get_by_role('button').nth(0).click();p.wait_for_function("separateMakeup.current().layers.find(l=>l.kind==='head').source===separateMakeupBase&&separateMakeupCalls.ai===0&&separateMakeupCalls.hair.length===0")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   if not p.locator('.studio-makeup-row').is_visible():menu.click()
   originals.get_by_role('button').nth(1).click();p.wait_for_function("separateMakeupCalls.hair.length===1&&separateMakeupCalls.hair[0].finish==='natural'&&separateMakeupCalls.ai===0")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   if not p.locator('.studio-makeup-row').is_visible():menu.click()
   originals.get_by_role('button').nth(0).click();p.wait_for_function("separateMakeupCalls.hair.length===2&&separateMakeupCalls.hair[1].finish==='korean-rosy-v1'&&separateMakeupCalls.ai===0")
   assert not errors,errors;assert not services,services
   results.append({'language':lang,'width':width,'softHiddenAtStartAndStudio':True,'fiveChoicesOneRow':True,'equalCardHeights':True,'initialChoiceAndOriginalCallbacksWork':True,'legacyDraftLoads':legacy,'paidAiCalls':0});p.close()
 b.close()
print(json.dumps(results,indent=2))
