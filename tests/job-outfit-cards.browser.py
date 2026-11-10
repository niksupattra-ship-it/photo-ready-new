"""Real Studio/Easy outfit choices, local assets and inert rights only."""
import json, os, pathlib
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('JOB_CARDS_BASE','http://127.0.0.1:5193')
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=pathlib.Path(os.environ.get('JOB_CARDS_OUTPUT','/tmp/job-outfit-cards'));OUT.mkdir(parents=True,exist_ok=True)
reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['th','en']:
  for width in [390,1440]:
   for easy in ([False,True]if lang=='th'else[False]):
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
      removed={'female-formal-suit','female-lapel-suit','female-suit-03','female-suit-04','male-suit-03','male-suit-04','male-formal-tie-suit','male-open-collar-suit'}
      assert not removed.intersection(o['id']for o in options),'Removed outfits reappeared'
      new_ids={'female-job-taupe-cream-blouse','female-job-light-blue-shirt','female-job-ivory-tweed-gold-buttons','female-job-navy-notch-white-shirt','female-job-navy-double-breasted-cream-blouse','male-job-blue-navy-tie','male-job-navy-double-breasted-black-tie','male-job-charcoal-burgundy-tie'}
      assert new_ids.issubset(o['id']for o in options)

      if easy:
       page.locator('.easy-tabs').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
       page.locator('.easy-suit-category-grid').get_by_role('button',name='Job application'if lang=='en'else'สมัครงาน',exact=True).click()
       cards=page.locator('.easy-suit-grid > button');expected=[o for o in options if o['cat']=='job' and o['gender']==gender]
      else:
       page.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
       cards=page.locator('.studio-catalog-grid button').filter(has=page.locator('img'))
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
      # Every new PNG must survive the existing search + native outfit transaction.
      added=[o for o in expected if o['id']in new_ids and o['gender']==gender]
      assert len(added)==(3 if gender=='male'else 5)
      search=page.locator('.easy-mode input[type=search]'if easy else'.studio-redesign input[type=search]')
      selected=[]
      for target in added:
       for query in [target['title'],target['choiceLabel']]:
        search.fill(query)
        card=cards.and_(page.get_by_role('button',name=target['choiceLabel']if easy else target['studioLabel'],exact=True))
        expect(card).to_have_count(1);assert not card.inner_text().strip()
       card.scroll_into_view_if_needed();card.click()
       page.wait_for_function("id=>outfitCardSnapshot.current().layers.some(l=>l.kind==='suit'&&l.assetId===id)",arg=target['id'])
       selected.append(target['id'])
       if not search.is_visible():
        page.locator('.easy-tabs'if easy else'.studio-bottom-choices').get_by_role('button',name='Outfit'if lang=='en'else'ชุด',exact=True).click()
       search.fill('')
      assert not errors,errors;assert not requests,requests
      page.screenshot(path=str(OUT/(f'{lang}-{width}-{gender}-'+('easy'if easy else'studio')+'.png')))
      reports.append({'lang':lang,'width':width,'easy':easy,'gender':gender,'jobCards':len(expected),'imageOnly':True,'accessibleLabels':True,'bilingualSearch':True,'newNativeSelections':selected,'removedAbsent':True})
      print(json.dumps(reports[-1]),flush=True)
     except Exception:
      page.screenshot(path=str(OUT/'failure.png'));raise
     finally:page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(reports,indent=2))
print(json.dumps({'passed':len(reports),'externalRequests':0,'paidAiCalls':0}))
