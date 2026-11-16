"""Compare cold and anticipated menu opens over the same throttled HTTP link.
The same 1.8s choice dwell is allowed in both cases. Requires Vite at port 5173.
"""
import asyncio,json,time,os
from playwright.async_api import async_playwright,expect
BASE=os.environ.get('EASY_PICKER_BASE','http://127.0.0.1:5173')

async def sample(browser,width,warm):
 page=await browser.new_page(viewport={'width':width,'height':1000})
 await page.add_init_script("Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:"+str(not warm).lower()+"}})")
 errors=[];images=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('request',lambda request:images.append(request.url) if request.resource_type=='image' else None)
 await page.goto(BASE+'/scripts/fixtures/easy-picker-previews.html?gender=female&manual=1')
 await expect(page.get_by_role('button',name='ทรงผม',exact=True)).to_be_visible()
 session=await page.context.new_cdp_session(page)
 await session.send('Network.enable')
 await session.send('Network.emulateNetworkConditions',{'offline':False,'latency':180,'downloadThroughput':64*1024,'uploadThroughput':64*1024})
 await page.evaluate('pickerFixture.startWarmup()')
 await page.wait_for_timeout(1800)
 warmed=sum('/hair-picker-thumbnails/' in url for url in images)
 if warm:assert warmed==8,(width,warmed)
 else:assert warmed==0,(width,warmed)
 started=time.monotonic()
 await page.get_by_role('button',name='ทรงผม',exact=True).click()
 await page.wait_for_function('document.querySelectorAll(".easy-hair-thumbnail img").length>=8&&[...document.querySelectorAll(".easy-hair-thumbnail img")].slice(0,8).every(im=>im.complete&&im.naturalWidth>0)',timeout=20000)
 elapsed=round((time.monotonic()-started)*1000)
 assert not errors,errors
 assert not any('/uniform-quick-previews/' in url or '/seedream-hairstyles/previews/' in url for url in images),images
 await page.close()
 return {'width':width,'prewarm':warm,'choiceDwellMs':1800,'firstEightHairMs':elapsed,'prewarmedHairRequests':warmed,'errors':errors}

async def run():
 results=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in [390,1440]:
   cold=await sample(browser,width,False);warm=await sample(browser,width,True)
   assert warm['firstEightHairMs']<cold['firstEightHairMs'],(cold,warm)
   results.extend([cold,warm])
  await browser.close()
 print(json.dumps(results))

asyncio.run(run())
