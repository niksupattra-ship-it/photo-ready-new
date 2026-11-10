"""Repair an existing English pair using actual App/Studio handlers; inert face fixtures.
Real landmark/segmentation photographic verification is a separate local evidence run.
"""
import pathlib,json,os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('HEAD_BALANCE_BASE','http://127.0.0.1:5173');OUT=pathlib.Path('/workspace/work/english-head-balance/browser');OUT.mkdir(exist_ok=True)
results=[]
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [1440,390]:
  p=b.new_page(viewport={'width':width,'height':1000 if width>600 else 844},has_touch=width<600);p.set_default_timeout(15000);errors=[];forbidden=[];p.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if not r.request.url.startswith(BASE+'/')or'/api/'in r.request.url:forbidden.append(r.request.url);r.abort();return
   r.continue_()
  p.route('**/*',route)
  try:
   p.goto(BASE+'/scripts/fixtures/english-head-balance.html?lang=en',wait_until='networkidle');p.wait_for_function('!!headFixture.snapshot.current');head=lambda:p.evaluate("headFixture.snapshot.current().layers.find(l=>l.kind==='head')");before=head()
   def open_controls():
    if width<600:
     c=p.locator('.studio-stage>canvas');box=c.bounding_box();c.click(position={'x':box['width']*.5,'y':box['height']*.24});p.get_by_role('button',name='Selected tool: Move',exact=True).click()
   open_controls();button=p.get_by_role('button',name='Balance head size',exact=True);expect(button).to_be_visible();button.click();p.wait_for_function("headFixture.snapshot.current().layers.some(l=>l.englishHeadBalanceVersion==='measured-head-only-v1')");after=head();assert after['jobId']==before['jobId']=='same-owned-job';assert after['portraitFramingVersion'].endswith('v8-measured-head-balance');assert after['source']!=before['source'];assert after['studioSkinBaseSource']!=before['studioSkinBaseSource'];assert after['aiMakeupSource']!=before['aiMakeupSource']
   for key in ['sourceFrame','x','y','scale','rotation','opacity']:assert after.get(key)==before.get(key),key
   assert abs(after['englishHeadBalance']['faceRatioAfter']-.3)<.004
   assert p.evaluate("async()=>{const h=headFixture.snapshot.current().layers.find(l=>l.kind==='head'),a=await createImageBitmap(await(await fetch(h.studioSkinBaseSource)).blob()),b=await createImageBitmap(await(await fetch(h.aiMakeupSource)).blob());const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(a,0,0);const n=x.getImageData(0,0,c.width,c.height).data;x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const m=x.getImageData(0,0,c.width,c.height).data;let ok=a.width===450&&a.height===600&&b.width===450&&b.height===600;for(let i=3;i<n.length;i+=4)if(n[i]!==m[i])ok=false;a.close();b.close();return ok}")
   p.screenshot(path=str(OUT/(str(width)+'-balanced.png')),full_page=True)
   # Real Undo restores the complete old pair and redo restores the balanced pair.
   p.get_by_role('button',name='Back',exact=True).filter(visible=True).first.click();p.wait_for_function("!headFixture.snapshot.current().layers.find(l=>l.kind==='head').englishHeadBalanceVersion");assert head()['source']==before['source'];p.get_by_role('button',name='Redo',exact=True).filter(visible=True).first.click();p.wait_for_function("headFixture.snapshot.current().layers.find(l=>l.kind==='head').englishHeadBalanceVersion");assert head()['source']==after['source']
   if width<600 and not button.is_visible():open_controls()
   button.click();p.wait_for_function("document.body.innerText.includes('Head size is already balanced.')");assert head()['source']==after['source'],'Repeated repair shrank a second time'
   p.locator('.studio-bottom-choices').get_by_role('button',name='Makeup',exact=True).click();p.locator('.studio-portrait-finish-choice').last.click();p.wait_for_function("headFixture.snapshot.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='natural'");natural=head();assert natural['source']==after['studioSkinBaseSource'];p.locator('.studio-portrait-finish-choice').first.click();p.wait_for_function("headFixture.snapshot.current().layers.find(l=>l.kind==='head').femaleEyeStyle==='makeup'");assert head()['source']==after['aiMakeupSource'];assert not forbidden and not errors,(forbidden,errors)
   results.append({'width':width,'passed':True,'sameOwnedJob':True,'wholePairAdjusted':True,'sameAlphaAndDimensions':True,'portraitTransformKept':True,'undoRedo':True,'repeatIdempotent':True,'naturalMakeupSwitchRetained':True,'noAiPaymentOrApiCalls':True});print(json.dumps(results[-1]),flush=True)
  except Exception:p.screenshot(path=str(OUT/(str(width)+'-failure.png')),full_page=True);raise
  finally:p.close()
 # Thai does not acquire the English repair control.
 p=b.new_page();p.goto(BASE+'/scripts/fixtures/english-head-balance.html?lang=th',wait_until='networkidle');assert p.locator('.english-head-balance').count()==0;p.close();b.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
