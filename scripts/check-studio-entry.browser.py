"""Built app: keep Home visible while opening Studio; never load native outfits.
Uses local public files and inert API responses. No customer, payment or AI calls.
"""
import asyncio,json,mimetypes,pathlib
from playwright.async_api import async_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
ORIGIN='https://studio-entry.invalid'
NATIVE=set(json.loads((ROOT/'src/studio-starters.json').read_text())['uniforms'])

async def run():
 results=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in [390,1440]:
   for failure in [False,True]:
    page=await browser.new_page(viewport={'width':width,'height':1000})
    errors=[];native=[];clicked=False;blocked=failure
    page.on('pageerror',lambda error:errors.append(str(error)))
    async def fixture(route):
     url=route.request.url
     if not url.startswith(ORIGIN+'/'):await route.fulfill(status=204,body='');return
     path=url[len(ORIGIN):].split('?')[0]
     if path.startswith('/api/'):
      await route.fulfill(content_type='application/json',body=json.dumps({'ok':True,'walletId':'wallet_fixture','items':[],'trialRemaining':2,'trialAvailable':True,'unlockedJobIds':[],'editableJobIds':[],'generationRemaining':0,'revision':'1234567890abcdef12345678'}));return
     if clicked and path in NATIVE:native.append(path);await route.abort();return
     if path.startswith('/assets/studio-editor-')and path.endswith('.js'):
      if blocked:await route.abort();return
      await asyncio.sleep(1)
     if path.startswith('/assets/uniform-quick-previews/'):await asyncio.sleep(.3)
     file=ROOT/'dist'/path.lstrip('/')
     if path=='/':file=ROOT/'dist/index.html'
     if not file.is_file():await route.fulfill(status=404,body='missing fixture');return
     await route.fulfill(content_type=mimetypes.guess_type(str(file))[0]or'application/octet-stream',body=file.read_bytes())
    await page.route('**/*',fixture)
    await page.goto(ORIGIN,wait_until='domcontentloaded')
    await expect(page.locator('.easy-landing-page .easy-studio')).to_be_visible()
    clicked=True
    await page.locator('.easy-landing-page .easy-studio').click()
    await expect(page.locator('.easy-landing-page')).to_be_visible()
    assert await page.locator('.studio-starting').count()==0
    if failure:
     await expect(page.get_by_role('button',name='ลองอีกครั้ง',exact=True)).to_be_visible()
     await expect(page.get_by_role('alert')).to_contain_text('เปิด Studio ไม่สำเร็จ')
     blocked=False
     await page.get_by_role('button',name='ลองอีกครั้ง',exact=True).click()
    await expect(page.locator('.idstudio.studio-redesign')).to_be_visible(timeout=20000)
    await page.wait_for_function("()=>{const c=document.querySelector('.studio-stage>canvas');return c&&c.width&&c.height&&c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]>0}")
    assert await page.locator('.studio-starting,.studio-tools-loading').count()==0
    assert not native,native
    assert not errors,errors
    results.append({'width':width,'retry':failure,'intermediateBlankPage':False,'nativeOutfitRequests':0,'studioVisible':True,'errors':errors})
    await page.close()
  await browser.close()
 print(json.dumps(results))

asyncio.run(run())
