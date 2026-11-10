"""Actual Studio/Easy and English manual PNG selection with held originals.
No account, payment or AI endpoints are contacted. Preview pixels never commit.
"""
import json,os,pathlib,time,traceback
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path(os.environ.get('SUIT_PREVIEW_OUTPUT','/tmp/suit-instant-preview'));OUT.mkdir(parents=True,exist_ok=True)
IDS=['female-job-ivory-bow-blouse','female-job-light-pink-tweed-pearl-trim','female-job-navy-suit-gathered-cream-blouse','female-job-dusty-rose-tweed-pearl-buttons']
PATHS=['/assets/job-uniforms/'+id+'.png'for id in IDS];results=[]
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang,width,easy,processed in [('th',1440,False,True),('th',390,False,True),('th',1440,True,True),('th',390,True,True),('en',1440,False,True),('en',390,False,True),('en',390,False,False)]:
  if os.environ.get('SUIT_PREVIEW_LANG')and lang!=os.environ['SUIT_PREVIEW_LANG']:continue
  name=f'{lang}-{width}-'+('easy'if easy else'studio')+('-processed'if processed else'-raw');p=browser.new_page(viewport={'width':width,'height':1000 if width>600 else 844},has_touch=width<600,accept_downloads=True);p.set_default_timeout(15000);held={};errors=[];api=[];downloads=[]
  p.on('pageerror',lambda e:errors.append(str(e)));p.on('download',lambda d:downloads.append(d))
  def route(r):
   if not r.request.url.startswith(BASE+'/'):r.abort();return
   if '/api/'in r.request.url:api.append(r.request.url);r.abort();return
   path=urlparse(r.request.url).path
   if path in PATHS:held[path]=r;return
   r.continue_()
  p.route('**/*',route)
  def card(id):return p.locator('.easy-suit-grid button'if easy else'.studio-catalog-grid button').filter(has=p.locator('img[src*="'+id+'"]'))
  def selection():return p.evaluate("()=>{const s=suitFixture.snapshot.current().layers.find(l=>l.kind==='suit');return {id:s.assetId||null,frame:s.sourceFrame,source:s.source}}")
  def wait_held(path):
   until=time.monotonic()+5
   while path not in held and time.monotonic()<until:p.wait_for_timeout(10)
   assert path in held,path
  def measure(id):
   b=card(id);b.scroll_into_view_if_needed();b.evaluate('''button=>{window.firstSuitPaintMs=null;button.addEventListener('click',()=>{const c=document.querySelector('.studio-stage>canvas'),probe=document.createElement('canvas');probe.width=120;probe.height=160;const x=probe.getContext('2d',{willReadFrequently:true}),hash=()=>{x.clearRect(0,0,120,160);x.drawImage(c,0,0,120,160);const d=x.getImageData(0,0,120,160).data;let h=2166136261;for(let i=0;i<d.length;i++)h=Math.imul(h^d[i],16777619);return h},initial=hash(),start=performance.now();const tick=()=>{if(hash()!==initial)window.firstSuitPaintMs=performance.now()-start;else requestAnimationFrame(tick)};requestAnimationFrame(tick)},{once:true})}''')
   b.click();p.wait_for_function('firstSuitPaintMs!==null');ms=p.evaluate('firstSuitPaintMs');assert ms<350,(name,id,ms);assert p.locator('.studio-stage>canvas').evaluate('c=>{const d=c.getContext("2d").getImageData(Math.floor(c.width*.5),Math.floor(c.height*.875),1,1).data;return !(d[0]===131&&d[1]===201&&d[2]===239)}'),'No garment pixels appeared';return ms
  try:
   p.goto(BASE+'/scripts/fixtures/suit-instant-preview.html?lang='+lang+'&processed='+('1'if processed else'0')+('&easy=1'if easy else''),wait_until='domcontentloaded');p.add_style_tag(url=BASE+'/src/style.css');p.wait_for_function('!!suitFixture.snapshot.current');p.locator('.studio-stage>canvas').wait_for(state='attached');p.wait_for_timeout(100)
   if easy:
    p.locator('.easy-tabs').get_by_role('button',name='ชุด',exact=True).click();p.locator('.easy-suit-category-grid').get_by_role('button',name='สมัครงาน',exact=True).click()
   else:p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
   for id in IDS:card(id).scroll_into_view_if_needed();card(id).locator('img').evaluate('async im=>{await im.decode()}')
   assert not held,'Full-size files should not load for unchosen options';initial=selection();initial_head=p.evaluate("suitFixture.snapshot.current().layers.find(l=>l.kind==='head'||l.kind==='source-photo')")
   first=measure(IDS[0]);wait_held(PATHS[0]);assert selection()==initial
   download=p.get_by_role('button',name='Download photo'if lang=='en'else'ดาวน์โหลดรูป',exact=True).filter(visible=True).first;expect(download).to_be_disabled();expect(card(IDS[1])).to_be_enabled()
   second=measure(IDS[1]);wait_held(PATHS[1]);assert selection()==initial
   held.pop(PATHS[1]).continue_();p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind===\'suit\').assetId===id',arg=IDS[1]);expect(download).to_be_enabled()
   assert p.evaluate("async()=>{const s=suitFixture.snapshot.current().layers.find(l=>l.kind==='suit'),im=await createImageBitmap(await(await fetch(s.source)).blob());const ok=im.width===1504&&im.height===1285;im.close();return ok}")
   if lang=='en':
    assert p.evaluate("suitFixture.snapshot.current().layers.find(l=>l.kind==='head'||l.kind==='source-photo')")==initial_head,'Manual PNG selection changed portrait pixels/geometry';assert p.evaluate('suitFixture.faceCalls')==1,'Face calls: '+str(p.evaluate('suitFixture.faceCalls'))
   held.pop(PATHS[0]).continue_();p.wait_for_timeout(150);assert selection()['id']==IDS[1],'Late old original overwrote latest choice'
   # Undo/redo contain only the full-quality committed choice.
   if not easy:
    p.get_by_role('button',name='Back'if lang=='en'else'ย้อนกลับ',exact=True).filter(visible=True).first.click();p.wait_for_function("!suitFixture.snapshot.current().layers.find(l=>l.kind==='suit').assetId")
    p.get_by_role('button',name='Redo'if lang=='en'else'ทำซ้ำ',exact=True).filter(visible=True).first.click();p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind===\'suit\').assetId===id',arg=IDS[1])
   if not easy and width<600 and not card(IDS[2]).is_visible():p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
   stable=selection();stable_pixels=p.locator('.studio-stage>canvas').evaluate('c=>c.toDataURL()');third=measure(IDS[2]);wait_held(PATHS[2]);card(IDS[1]).click();expect(download).to_be_enabled();held.pop(PATHS[2]).abort();p.wait_for_timeout(100);assert selection()==stable;assert p.locator('.studio-stage>canvas').evaluate('c=>c.toDataURL()')==stable_pixels
   fourth=measure(IDS[3]);wait_held(PATHS[3]);held.pop(PATHS[3]).abort();expect(download).to_be_enabled();assert selection()==stable;assert p.locator('.studio-stage>canvas').evaluate('c=>c.toDataURL()')==stable_pixels
   # The same failed source can retry and deliver its original pixels.
   card(IDS[3]).click();wait_held(PATHS[3]);held.pop(PATHS[3]).continue_();p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind===\'suit\').assetId===id',arg=IDS[3]);expect(download).to_be_enabled();accepted=selection()
   if processed:
    before=p.evaluate('suitFixture.policies.length');p.evaluate('suitFixture.rejectPolicy=true');card(IDS[0]).click();p.wait_for_function('n=>suitFixture.policies.length>n',arg=before);expect(download).to_be_enabled();assert selection()==accepted,'Policy rejection retained an unapproved file'
   if lang=='en':
    assert p.evaluate('''async()=>{const {measureEnglishManualOutfitFace}=await import('/src/english-manual-outfit.js'),c=Object.assign(document.createElement('canvas'),{width:32,height:32});let count=0;const detect=async()=>{count++;return suitFixture.face},args={head:{source:c},headSource:c,measureFace:detect};await measureEnglishManualOutfitFace(args);await measureEnglishManualOutfitFace(args);if(count!==1)return false;c.getContext('2d').fillRect(2,2,3,3);await measureEnglishManualOutfitFace(args);return count===2}'''),'Edited face pixels did not invalidate measurement cache'
   assert p.evaluate('suitFixture.aiCalls')==0;assert not api and not downloads;assert not errors,errors
   p.screenshot(path=str(OUT/(name+'.png')),full_page=True);r={'case':name,'passed':True,'firstPaintMs':[round(v,1)for v in[first,second,third,fourth]],'originalsHeld':True,'fullSource':[1504,1285],'lastSelectionWins':True,'failureRetryAndPolicyRollback':True,'previewNeverCommitted':True,'noAiOrDownloads':True,'faceCacheInvalidation':lang=='en'}
  except Exception as e:
   p.screenshot(path=str(OUT/(name+'-failure.png')),full_page=True);r={'case':name,'passed':False,'error':str(e),'traceback':traceback.format_exc(),'pageErrors':errors};print(json.dumps(r),flush=True);raise
  finally:
   for q in held.values():
    try:q.abort()
    except:pass
   p.close()
  results.append(r);print(json.dumps(r),flush=True)
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps({'passed':len(results),'firstPaintSamples':sum(len(r['firstPaintMs'])for r in results),'scope':'Local fixture with actual Studio/Easy/manual handlers and held original PNGs; no real account/payment/AI.'}))
