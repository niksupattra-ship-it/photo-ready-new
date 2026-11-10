"""Actual Studio catalog on narrow/touch/desktop screens with constrained network."""
import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for lang,width,touch in [('en',390,True),('en',768,True),('en',1440,False),('th',390,True)]:
  p=b.new_page(viewport={'width':width,'height':844},is_mobile=width<640,has_touch=touch);errors=[];assets=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.on('request',lambda r:assets.append(r.url) if '/assets/' in r.url else None)
  p.goto(base+'/scripts/fixtures/mobile-catalog.html?lang='+lang,wait_until='networkidle')
  network=p.context.new_cdp_session(p);network.send('Network.enable');network.send('Network.emulateNetworkConditions',{'offline':False,'latency':100,'downloadThroughput':100*1024,'uploadThroughput':50*1024})
  p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit' if lang=='en' else 'ชุด',exact=True).click()
  rail=p.locator('.studio-picker-drawer .studio-catalog-grid')
  p.wait_for_function("()=>{const r=document.querySelector('.studio-picker-drawer .studio-catalog-grid');return r&&[...r.querySelectorAll('img')].some(i=>i.complete&&i.naturalWidth>0)}")
  p.wait_for_function("""()=>{const r=document.querySelector('.studio-picker-drawer .studio-catalog-grid'),box=r.getBoundingClientRect(),drawer=document.querySelector('.studio-picker-drawer').getBoundingClientRect();const visible=[...r.querySelectorAll('img')].filter(i=>{const b=i.getBoundingClientRect();return b.width>0&&b.right>box.left&&b.left<box.right&&b.bottom>box.top&&b.top<Math.min(box.bottom,drawer.bottom,innerHeight)&&b.bottom>drawer.top&&document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===i});return visible.length>0&&visible.every(i=>i.complete&&i.naturalWidth>0)}""")
  if lang=='en' and width==390:p.screenshot(path='/tmp/mobile-catalog-fixed.png')
  if lang=='en':
   widths=p.locator('.english-outfit-card').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().width)')
   assert min(widths)>=78,widths
  stats=rail.evaluate('''r=>{const box=r.getBoundingClientRect(),imgs=[...r.querySelectorAll('img')];return {total:imgs.length,started:imgs.filter(i=>i.getAttribute('src')).length,visible:imgs.filter(i=>{const b=i.getBoundingClientRect();return b.right>box.left&&b.left<box.right&&b.bottom>box.top&&b.top<box.bottom}).length}}''')
  if touch:assert stats['started']<stats['total'],stats
  if touch:
   rail.evaluate('r=>r.scrollLeft=r.scrollWidth');p.wait_for_timeout(300)
   p.wait_for_function("()=>{const r=document.querySelector('.studio-picker-drawer .studio-catalog-grid'),i=r.querySelector('img:last-of-type');return [...r.querySelectorAll('img')].slice(-2).every(i=>i.complete&&i.naturalWidth>0)}")
  p.locator('.studio-bottom-choices').get_by_role('button',name='Hairstyle' if lang=='en' else 'ทรงผม',exact=True).click()
  p.wait_for_function("()=>[...document.querySelectorAll('.studio-picker-drawer img')].some(i=>i.complete&&i.naturalWidth>0)")
  p.locator('.studio-bottom-choices').get_by_role('button',name='Background' if lang=='en' else 'พื้นหลัง',exact=True).click()
  p.wait_for_function("()=>[...document.querySelectorAll('.studio-picker-drawer img')].some(i=>i.complete&&i.naturalWidth>0)")
  assert not errors,errors
  assert not any('/assets/job-uniforms/' in u for u in assets),'full outfit files requested for browsing thumbnails'
  results.append({'lang':lang,'width':width,'touch':touch,**stats})
  p.close()
 print(json.dumps({'passed':True,'catalogs':results}));b.close()
