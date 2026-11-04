"""Hold full-resolution requests: visible previews must paint before commit.
Only the local Vite fixture is allowed. Never sends AI/payment/email requests.
"""
import json,os,pathlib,time,sys
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent;BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5192');OUT=ROOT/'work/selection-response';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for width in ([390]if '--failure'in sys.argv else[390,1440]):
  for easy in ([False]if '--failure'in sys.argv else[False,True]):
   for kind,path,name in [('suit','/assets/job-uniforms/female-lapel-suit.png','สูทปกแหลม'),('collar','/assets/government-insignia/garuda-left.png','มท.'),('chest','/assets/government-insignia/chest-pao.png','อบจ.'),('ribbon','/assets/ribbons/2504-2514.png','2504-2514')]:
    if '--failure'in sys.argv and kind!='chest':continue
    ctx=browser.new_context(viewport={'width':width,'height':1000},has_touch=width<600);p=ctx.new_page();p.set_default_timeout(20000);held=[];errors=[];api=[];downloads=[]
    p.on('pageerror',lambda e:errors.append(str(e)));p.on('download',lambda d:downloads.append(d))
    def route(r):
     url=r.request.url
     if not url.startswith(BASE+'/'):r.abort();return
     if '/api/'in url:api.append(url);r.abort();return
     if url.split('?')[0]==BASE+path:held.append(r);return
     r.continue_()
    p.route('**/*',route)
    try:
     p.goto(BASE+'/scripts/fixtures/selection-response.html'+('?easy=1'if easy else''),wait_until='domcontentloaded')
     p.wait_for_function('!!window.selectionSnapshot?.current');p.wait_for_function("!!document.querySelector('.studio-stage canvas')?.width")
     root=p.locator('.easy-mode')if easy else p.locator('.idstudio')
     if easy:
      root.locator('.easy-tabs').get_by_role('button',name='ชุด'if kind=='suit'else'เครื่องหมาย',exact=True).click()
      if kind=='suit':root.get_by_role('button',name='สมัครงาน',exact=True).click()
      card=root.locator('.easy-suit-grid button').filter(has=p.locator('img[src*="female-lapel-suit"]'))if kind=='suit'else root.get_by_role('button',name=name,exact=True)
     else:
      p.locator('.studio-bottom-choices').get_by_role('button',name={'suit':'ชุด','collar':'เข็มปกคอ','chest':'เข็มติดอก','ribbon':'แพรแถบ'}[kind],exact=True).click()
      card=p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="female-lapel-suit"]'))if kind=='suit'else p.get_by_role('button',name='เลือก'+{'collar':'เข็มปกคอ','chest':'เข็มติดอก','ribbon':'แพรแถบ'}[kind]+' '+name,exact=True)
     card.scroll_into_view_if_needed();p.wait_for_function('e=>e.querySelector("img")?.complete&&e.querySelector("img")?.naturalWidth>0',arg=card.element_handle());p.wait_for_timeout(100)
     before=p.evaluate("JSON.stringify(selectionSnapshot.current().layers.map(l=>[l.kind,l.assetId,l.templatePath,l.sourceFrame,l.x,l.y,l.scale,l.rotation]))")
     canvas='.easy-preview canvas'if easy else'.studio-stage canvas'
     card.evaluate('''(button,selector)=>{button.addEventListener('click',()=>{const c=document.querySelector(selector),probe=document.createElement('canvas');probe.width=128;probe.height=170;const x=probe.getContext('2d',{willReadFrequently:true}),hash=()=>{x.clearRect(0,0,128,170);x.drawImage(c,0,0,128,170);const d=x.getImageData(0,0,128,170).data;let h=2166136261;for(let i=0;i<d.length;i++)h=Math.imul(h^d[i],16777619);return h};const initial=hash(),start=performance.now();window.selectionPaintMs=null;const tick=()=>{if(hash()!==initial)window.selectionPaintMs=performance.now()-start;else requestAnimationFrame(tick)};requestAnimationFrame(tick)},{once:true,capture:true})}''',canvas)
     card.click();p.wait_for_function('selectionPaintMs!==null',timeout=10000);p.wait_for_timeout(100)
     assert held,'Full-resolution request was not held: '+path
     after=p.evaluate("JSON.stringify(selectionSnapshot.current().layers.map(l=>[l.kind,l.assetId,l.templatePath,l.sourceFrame,l.x,l.y,l.scale,l.rotation]))")
     assert before==after,'Provisional pixels entered editor state'
     first_paint=p.evaluate('selectionPaintMs');assert first_paint<1000,first_paint
     if '--failure'in sys.argv:
      for r in held:r.abort()
      p.wait_for_function("document.querySelector('.studio-status')?.textContent.includes('ไม่สำเร็จ')")
      restored=p.evaluate("JSON.stringify(selectionSnapshot.current().layers.map(l=>[l.kind,l.assetId,l.templatePath,l.sourceFrame,l.x,l.y,l.scale,l.rotation]))")
      assert restored==before,'Failed full image changed the previous work'
      expect(card).to_be_enabled();count=len(held);card.click();p.wait_for_timeout(50)
      for attempt in range(100):
       if len(held)>count:break
       p.wait_for_timeout(50)
      assert len(held)>count,'A failed asset load could not be retried'
      for r in held[count:]:r.continue_()
     else:
      for r in held:r.continue_()
     expected_id={'suit':'female-lapel-suit','collar':'garuda-pair','chest':'pao','ribbon':'2504-2514'}[kind]
     p.wait_for_function("([kind,id])=>selectionSnapshot.current().layers.some(l=>l.kind===kind&&l.assetId===id)",arg=[kind,expected_id])
     p.wait_for_function("kind=>document.querySelector('.studio-status')?.textContent.includes('เลือก')||kind==='suit'",arg=kind)
     current=p.evaluate("kind=>selectionSnapshot.current().layers.find(l=>l.kind===kind)",kind)
     assert current['source'].startswith('data:image/png;')
     assert current['assetId']=={'suit':'female-lapel-suit','collar':'garuda-pair','chest':'pao','ribbon':'2504-2514'}[kind],current['assetId']
     assert not api,api;assert not errors,errors;assert not downloads
     results.append({'width':width,'easy':easy,'kind':kind,'previewBeforeFullImage':True,'firstPaintMs':round(first_paint,1),'noProvisionalCommit':True,'fullImageCommitted':True,'failedLoadRetry':('--failure'in sys.argv)})
     print(json.dumps(results[-1]),flush=True)
    except Exception:
     p.screenshot(path=str(OUT/f'failure-{width}-{easy}-{kind}.png'));raise
    finally:ctx.close()
 browser.close()
(OUT/('failure-results.json'if '--failure'in sys.argv else'browser-results.json')).write_text(json.dumps(results,indent=2));print(json.dumps({'passed':len(results),'externalRequests':0}))
