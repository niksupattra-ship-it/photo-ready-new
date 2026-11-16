"""Built English SEO routes, visible content and unchanged metadata after hydration.
Use ENGLISH_SEO_BASE for the preview server or live site. No AI/payment requests.
"""
import asyncio,json,os
from playwright.async_api import async_playwright,expect
BASE=os.environ.get('ENGLISH_SEO_BASE','http://127.0.0.1:5174')
PATHS=['/en/','/en/job-application-photos/','/en/photo-sizes/']
TITLE='AI Professional Headshots & Resume Photos Online | IDProm'

async def run():
 results=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  context=await browser.new_context(java_script_enabled=False,ignore_https_errors=True)
  for path in PATHS:
   page=await context.new_page();response=await page.goto(BASE+path)
   assert response.status==200,(path,response.status)
   assert await page.locator('html').get_attribute('lang')=='en'
   canonical=await page.locator('link[rel="canonical"]').get_attribute('href')
   assert canonical=='https://idpromth.com'+path,canonical
   assert await page.locator('h1,h2').count()>0
   assert await page.locator('a[href="/en/"]').count()>0 if path!='/en/' else await page.locator('a[href="/en/photo-sizes/"]').count()>0
   assert len(await page.locator('body').inner_text())>1500
   results.append({'path':path,'status':response.status,'EnglishWithoutJavaScript':True,'canonical':canonical})
   await page.close()
  await context.close()
  for width in [390,1440]:
   page=await browser.new_page(ignore_https_errors=True,viewport={'width':width,'height':1000});errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   async def route(request):
    url=request.request.url
    if '/api/'in url:
     await request.fulfill(content_type='application/json',body=json.dumps({'ok':True,'walletId':'wallet_fixture','items':[],'trialRemaining':2,'trialAvailable':True,'unlockedJobIds':[],'editableJobIds':[],'generationRemaining':0,'revision':'1234567890abcdef12345678'}));return
    if not url.startswith(BASE+'/'):await request.fulfill(status=204,body='');return
    await request.continue_()
   await page.route('**/*',route)
   await page.goto(BASE+'/en/');await expect(page.locator('.easy-primary')).to_be_enabled()
   assert await page.title()==TITLE
   assert (await page.locator('meta[name="description"]').get_attribute('content')).startswith('Create AI professional headshots')
   assert await page.locator('link[hreflang="en"]').get_attribute('href')=='https://idpromth.com/en/'
   for path in PATHS[1:]:
    await page.goto(BASE+path)
    assert await page.locator('h1').count()==1
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,path)
   assert not errors,errors
   results.append({'width':width,'EnglishMetadataRetained':True,'responsiveGuides':True,'errors':errors})
   await page.close()
  page=await browser.new_page(ignore_https_errors=True)
  await page.route('**/*',route)
  missing=await page.goto(BASE+'/en/not-a-real-guide/');assert missing.status==404
  root=await page.goto(BASE+'/');assert root.status==200
  assert await page.locator('html').get_attribute('lang')=='th'
  assert await page.locator('link[rel="canonical"]').get_attribute('href')=='https://idpromth.com/'
  results.append({'unknownEnglishPath':404,'ThaiLandingIntact':True})
  await browser.close()
 print(json.dumps(results))

asyncio.run(run())
