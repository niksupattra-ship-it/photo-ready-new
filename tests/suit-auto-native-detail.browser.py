"""Native garment detail appears while editing, without export, AI or repositioning."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('SUIT_DETAIL_BASE','http://127.0.0.1:5197')
IDS=['female-job-ivory-bow-blouse','female-job-light-pink-tweed-pearl-trim','female-job-navy-suit-gathered-cream-blouse']
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  for lang,easy in [('th',False),('th',True),('en',False)]:
   p=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600);p.set_default_timeout(20000)
   held={};errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def route(r):
    url=r.request.url.split('?')[0]
    if not url.startswith(BASE+'/') or '/api/' in url:r.abort()
    elif any(url==BASE+'/assets/job-uniforms/'+id+'.png' for id in IDS):held[url.rsplit('/',1)[-1][:-4]]=r
    else:r.continue_()
   p.route('**/*',route)
   p.goto(BASE+'/scripts/fixtures/suit-instant-preview.html?processed='+('1' if lang=='th' else '0')+'&detail=1&lang='+lang+('&easy=1' if easy else ''))
   p.wait_for_function('typeof suitFixture.snapshot.current === "function"')
   if easy:
    p.locator('.easy-tabs').get_by_role('button',name='ชุด',exact=True).click();p.locator('.easy-suit-category-grid button').first.click()
   else:p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit' if lang=='en' else 'ชุด',exact=True).click()
   def choose(id):
    group=p.locator('.easy-suit-grid' if easy else '.studio-catalog-grid')
    group.locator('button').filter(has=p.locator('img[src*="'+id+'"]')).first.click()
   def wait_native(id):
    for _ in range(100):
     if id in held:return
     p.wait_for_timeout(100)
    raise AssertionError('No automatic native request for '+id)
   if lang=='en':
    choose(IDS[0]);wait_native(IDS[0]);held[IDS[0]].continue_()
    p.wait_for_function('id=>suitFixture.snapshot.current().layers.some(l=>l.assetId===id&&!l.suitPreviewOnly)',arg=IDS[0])
   first,second=(IDS[1],IDS[2]) if lang=='en' else (IDS[0],IDS[1])
   choose(first);p.wait_for_function('suitFixture.snapshot.current().layers.some(l=>l.suitPreviewOnly)');wait_native(first)
   choose(second);p.wait_for_function('id=>suitFixture.snapshot.current().layers.some(l=>l.assetId===id&&l.suitPreviewOnly)',arg=second);wait_native(second)
   before=p.evaluate('''()=>{const ls=suitFixture.snapshot.current().layers;return {head:ls.find(l=>l.kind==='head'||l.kind==='source-photo'),suit:ls.find(l=>l.kind==='suit')}}''')
   held[second].continue_()
   p.wait_for_function('id=>suitFixture.snapshot.current().layers.some(l=>l.assetId===id&&l.suitPreviewOnly===false)',arg=second)
   after=p.evaluate('''async()=>{const ls=suitFixture.snapshot.current().layers,s=ls.find(l=>l.kind==='suit'),im=await createImageBitmap(await(await fetch(s.source)).blob());return {head:ls.find(l=>l.kind==='head'||l.kind==='source-photo'),suit:s,width:im.width,height:im.height}}''')
   assert after['width']>512 and after['height']>512
   assert after['head']==before['head'],'Refinement changed the portrait or its placement'
   for key in ['sourceFrame','collarFrame','x','y','scale','rotation','squeezeX','squeezeY','opacity','templatePath','assetId']:
    assert after['suit'].get(key)==before['suit'].get(key),key+' moved during native handoff'
   held[first].continue_();p.wait_for_timeout(300)
   assert p.evaluate('suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId')==second
   assert p.evaluate('suitFixture.aiCalls')==0 and not errors,errors
   print(json.dumps({'width':width,'lang':lang,'easy':easy,'nativeDetailWithoutExport':True,'nativeWidth':after['width'],'stablePlacement':True,'staleDecodeIgnored':True}),flush=True)
   p.close()
 browser.close()
