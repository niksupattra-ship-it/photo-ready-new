"""Real picker component under constrained image bandwidth; no account or AI APIs."""
import asyncio,json,os
from playwright.async_api import async_playwright
BASE=os.environ.get('HAIR_PICKER_BASE','http://127.0.0.1:5173')

async def run():
 results=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for language in ['th','en']:
   for gender in ['female','male']:
    for width in [390,1440]:
     page=await browser.new_page(viewport={'width':width,'height':840})
     errors=[];requests=[]
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.on('request',lambda request:requests.append(request.url))
     await page.route('**/api/**',lambda route:route.abort())
     await page.goto(BASE+'/scripts/fixtures/hair-picker-thumbnails.html?lang='+language+'&gender='+gender)
     await page.locator('#toggle-hair').wait_for()
     session=await page.context.new_cdp_session(page)
     await session.send('Network.enable')
     await session.send('Network.emulateNetworkConditions',{'offline':False,'latency':120,'downloadThroughput':96*1024,'uploadThroughput':64*1024})
     await page.locator('#toggle-hair').click()
     # All selected-tab images get a small source immediately, including those
     # below the scroll clipping ancestor. No observer must release them first.
     await page.wait_for_function("document.querySelectorAll('#hair-grid img').length===hairFixture.choices.length")
     state=await page.locator('#hair-grid img').evaluate_all("images=>images.map(im=>({src:im.getAttribute('src'),priority:im.getAttribute('fetchpriority')}))")
     assert all('/hair-picker-thumbnails/' in im['src'] for im in state),state
     assert all(im['priority']!='low' for im in state),state
     await page.wait_for_function("[...document.querySelectorAll('#hair-grid img')].every(im=>im.complete&&im.naturalWidth>0)",timeout=15000)
     await page.locator('#hair-scroll').evaluate('(el)=>el.scrollTop=el.scrollHeight')
     last=page.locator('#hair-grid button').last
     await last.click()
     selected=await page.evaluate('hairFixture.selected')
     assert selected==await page.evaluate('({id:hairFixture.choices.at(-1).id,source:hairFixture.choices.at(-1).src})')
     assert not any('/seedream-hairstyles/previews/' in url or '/hairstyle-previews/' in url for url in requests),requests
     assert not errors,errors
     results.append({'language':language,'gender':gender,'width':width,'tiles':len(state),'immediate_small_sources':True,'no_full_previews':True})
     await page.close()
  # A missing small file retains the exact original catalog preview as fallback.
  page=await browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  await page.route('**/assets/hair-picker-thumbnails/**',lambda route:route.fulfill(status=404,body='fixture missing'))
  await page.goto(BASE+'/scripts/fixtures/hair-picker-thumbnails.html?lang=th&gender=female')
  await page.locator('#toggle-hair').click()
  await page.wait_for_function("[...document.querySelectorAll('#hair-grid img')].every(im=>im.complete&&im.naturalWidth>0&&im.dataset.fallback==='1')",timeout=15000)
  assert not errors,errors
  results.append({'fallback_to_original':'PASS'})
  await browser.close()
 print(json.dumps(results))

asyncio.run(run())
