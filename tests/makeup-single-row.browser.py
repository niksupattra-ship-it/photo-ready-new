"""Uniform short makeup cards, one horizontally scrolling mobile row.
Only local callback doubles; all API and external requests blocked.
"""
from playwright.sync_api import sync_playwright,expect
import json,re
results=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [360,390]:
   p=b.new_page(viewport={'width':width,'height':900},has_touch=True);errors=[];requests=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    if '/api/' in r.request.url:requests.append(r.request.url);r.abort();return
    if not r.request.url.startswith('http://127.0.0.1:5192/'):r.abort();return
    r.continue_()
   p.route('**/*',route);p.goto('http://127.0.0.1:5192/scripts/fixtures/separate-ai-makeup.html?lang='+lang)
   p.wait_for_function('!!window.separateMakeup?.current');p.locator('#initial-finish-fixture').evaluate("el=>el.style.display='none'")
   p.wait_for_function("!document.querySelector('.studio-bottom-choices button')?.disabled")
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup' if lang=='en' else 'เมคอัพ',exact=True).click()
   row=p.locator('.studio-makeup-options');expect(row).to_be_visible();cards=row.locator('button');assert cards.count()==5
   p.wait_for_function("()=>{const bar=document.querySelector('.studio-bottom-choices').getBoundingClientRect();return [...document.querySelectorAll('.studio-makeup-options small')].every(el=>el.getBoundingClientRect().bottom<=bar.top+1)}")
   labels=[s.strip() for s in cards.all_text_contents()]
   if lang=='th':assert labels==['แต่งหน้า','ไม่แต่งหน้า','ผิวสว่าง','ผิววาว','ผิวเนียน'],labels
   else:assert not re.search('[ก-๙]',''.join(labels)),labels
   assert row.locator('h3,p,strong').count()==0;assert p.locator('.studio-additional-ai-makeup').count()==0;assert p.locator('#initial-finish-fixture button').count()==2
   boxes=row.evaluate("el=>[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})")
   assert max(v['y'] for v in boxes)-min(v['y'] for v in boxes)<1,boxes
   assert max(v['width'] for v in boxes)-min(v['width'] for v in boxes)<1,boxes
   assert max(v['height'] for v in boxes)-min(v['height'] for v in boxes)<1,boxes
   assert row.evaluate('(el)=>el.scrollWidth>el.clientWidth')
   if lang=='th' and width==390:p.screenshot(path='/tmp/makeup-single-row-mobile.png')
   for index,look in [(2,'skin-bright-v1'),(3,'skin-glow-v1'),(4,'skin-smooth-v1')]:
    button=cards.nth(index);button.scroll_into_view_if_needed();expect(button).to_be_enabled();button.click()
    p.wait_for_function("look=>separateMakeup.current().layers.find(l=>l.kind==='head').makeupStyles?.look===look",arg=look)
    p.wait_for_function("!document.querySelector('.studio-makeup-options button')?.disabled")
    expect(button).to_have_attribute('aria-pressed','true')
   assert not errors,errors;assert not requests,requests
   results.append({'language':lang,'width':width,'singleRow':True,'equalCards':True,'shortNamesOnly':True,'allThreeLocalLooksWork':True,'externalRequests':0});p.close()
 b.close()
print(json.dumps(results,indent=2))
