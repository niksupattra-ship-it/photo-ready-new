"""Real Studio/Easy outfit choices, local assets and inert rights only."""
import json, os, pathlib
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('JOB_CARDS_BASE','http://127.0.0.1:5193')
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'work/job-outfit-cards';OUT.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [390,1440]:
   for easy in [False,True]:
    for gender in ['male','female']:
     page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600);errors=[];requests=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     def route(r):
      if not r.request.url.startswith(BASE+'/') or '/api/' in r.request.url:
       requests.append(r.request.url);r.abort();return
      r.continue_()
     page.route('**/*',route)
     try:
      page.goto(BASE+'/scripts/fixtures/job-outfit-cards.html?lang='+lang+'&gender='+gender+('&easy=1'if easy else''),wait_until='domcontentloaded')
      page.wait_for_function('!!outfitCardSnapshot?.current');page.wait_for_function("!!document.querySelector('.studio-stage canvas')?.width")
      options=page.evaluate('outfitCardOptions')
      if easy:
       page.locator('.easy-tabs').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
       page.locator('.easy-suit-category-grid').get_by_role('button',name='Job application'if lang=='en'else'สมัครงาน',exact=True).click()
       cards=page.locator('.easy-suit-grid > button');expected=[o for o in options if o['cat']=='job' and o['gender']==gender]
      else:
       page.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
       cards=page.locator('.studio-catalog-grid > button').filter(has=page.locator('img'))
       expected=[o for o in options if o['cat']=='job']
      for option in expected:
       card=cards.and_(page.get_by_role('button',name=option['choiceLabel'] if easy else option['studioLabel'],exact=True))
       expect(card).to_have_count(1)
       assert not card.inner_text().strip(),(option['id'],card.inner_text())
       assert card.get_attribute('aria-label'),option['id']
      # All Thai institutional labels remain visible in the same picker.
      if lang=='th' and not easy:
       government=[o for o in options if o['cat']=='government'][0]
       expect(cards.and_(page.get_by_role('button',name=government['studioLabel'],exact=True)).locator('small')).to_have_text(government['name'])
      # Exercise the existing native outfit transaction after selecting a captionless card.
      uploaded=[o for o in expected if o['gender']=='male' and o['id'].startswith('male-job-')]
      if gender=='male':assert uploaded,'New male suits are missing'
      scenario=(2 if lang=='en'else 0)+(1 if width==1440 else 0)+(1 if easy else 0)
      target=uploaded[scenario%len(uploaded)] if gender=='male' else [o for o in expected if o['gender']==gender][-1]
      card=cards.and_(page.get_by_role('button',name=target['choiceLabel'] if easy else target['studioLabel'],exact=True))
      card.scroll_into_view_if_needed();card.click()
      page.wait_for_function("id=>outfitCardSnapshot.current().layers.some(l=>l.kind==='suit'&&l.assetId===id)",arg=target['id'])
      assert not errors,errors;assert not requests,requests
      if gender=='male':page.screenshot(path=str(OUT/(f'{lang}-{width}-'+('easy'if easy else'studio')+'.png')))
      reports.append({'lang':lang,'width':width,'easy':easy,'gender':gender,'jobCards':len(expected),'imageOnly':True,'accessibleLabels':True,'nativeSelection':True,'selectedId':target['id']})
      print(json.dumps(reports[-1]),flush=True)
     except Exception:
      page.screenshot(path=str(OUT/'failure.png'));raise
     finally:page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(reports,indent=2))
print(json.dumps({'passed':len(reports),'externalRequests':0,'paidAiCalls':0}))
