"""Controlled build audit: local assets, mocked wallet, no AI/payment/network."""
import json,pathlib,time,statistics,mimetypes
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent; OUT=ROOT/'work/performance-audit'; OUT.mkdir(parents=True,exist_ok=True); ORIGIN='https://idprom-preview.invalid'
INIT="""window.audit={lcp:0,cls:0,longTasks:[]};for(const type of ['largest-contentful-paint','layout-shift','longtask']){try{new PerformanceObserver(list=>{for(const e of list.getEntries()){if(type==='largest-contentful-paint')audit.lcp=e.startTime;if(type==='layout-shift'&&!e.hadRecentInput)audit.cls+=e.value;if(type==='longtask')audit.longTasks.push({start:e.startTime,duration:e.duration})}}).observe({type,buffered:true})}catch{}}"""
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
 for width,height,cpu in [(1440,1000,1),(390,844,4)]:
  for lang in ['th','en']:
   for run in range(3):
    context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<500,has_touch=width<500)
    p=context.new_page();p.set_default_timeout(15000);p.add_init_script(INIT)
    cdp=context.new_cdp_session(p);cdp.send('Emulation.setCPUThrottlingRate',{'rate':cpu})
    requests=[];errors=[];blocked=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
     u=r.request.url
     if not u.startswith(ORIGIN+'/'):blocked.append(u);r.fulfill(status=204,body='');return
     name=u.split(ORIGIN,1)[1].split('?')[0]
     if name.startswith('/api/'):
      blocked.append(name)
      data={'walletId':'wallet_fixture','ok':True,'items':[],'trialRemaining':2,'trialAvailable':True,'unlockedJobIds':[],'editableJobIds':[],'revision':'1234567890abcdef12345678'}
      r.fulfill(content_type='application/json',body=json.dumps(data));return
     f=ROOT/'dist'/name.lstrip('/')
     if not f.is_file():f=ROOT/'dist/index.html'
     data=f.read_bytes();requests.append({'path':name,'bytes':len(data)})
     r.fulfill(content_type=mimetypes.guess_type(str(f))[0]or'application/octet-stream',body=data)
    p.route('**/*',route)
    p.goto(ORIGIN+('/?lang=en' if lang=='en' else '/'),wait_until='load');p.wait_for_timeout(600)
    home=p.evaluate("({...audit,paint:performance.getEntriesByType('paint').map(e=>({name:e.name,ms:e.startTime})),ready:document.querySelector('.easy-primary')?.disabled===false})")
    home['requests']=len(requests);home['bytes']=sum(r['bytes']for r in requests)
    home['largestAssets']=sorted(requests,key=lambda r:r['bytes'],reverse=True)[:5]
    assert home['ready'];before=len(requests);start=time.monotonic();p.locator('.easy-studio').click();p.locator('.idstudio.studio-redesign').wait_for();p.wait_for_function("!!document.querySelector('.studio-bottom-choices button:not([disabled])')")
    studio_ms=(time.monotonic()-start)*1000
    p.wait_for_timeout(300)
    report={'width':width,'cpuThrottle':cpu,'language':lang,'run':run+1,'home':home,'studioReadyMs':round(studio_ms,1),'studioRequests':requests[before:],'errors':errors,'mockedOrBlocked':blocked}
    assert not errors,errors
    results.append(report);context.close()
 browser.close()
(OUT/'built-startup.json').write_text(json.dumps({'scope':'Local built assets; cold isolated contexts; no internet timings, actual phone or AI; mobile CPU throttle 4x','runs':results},indent=2))
for width in [1440,390]:
 for lang in ['th','en']:
  group=[r for r in results if r['width']==width and r['language']==lang]
  print(json.dumps({'width':width,'lang':lang,'medianFCP':round(statistics.median(next(e['ms']for e in r['home']['paint']if e['name']=='first-contentful-paint')for r in group)),'medianLCP':round(statistics.median(r['home']['lcp']for r in group)),'maxCLS':max(r['home']['cls']for r in group),'medianStudioReadyMs':statistics.median(r['studioReadyMs']for r in group),'homeBytes':group[0]['home']['bytes'],'largestAssets':group[0]['home']['largestAssets']}))
