"""Real EasyMode menus over throttled local HTTP, with original selection callbacks.
Run after npm run build with a Vite dev server at EASY_PICKER_BASE. No AI/payment APIs.
"""
import asyncio,json,os,time
from playwright.async_api import async_playwright,expect
BASE=os.environ.get('EASY_PICKER_BASE','http://127.0.0.1:5173')

async def visible_ready(page,selector):
 await page.wait_for_function("selector=>{const all=[...document.querySelectorAll(selector)],visible=all.filter(im=>{const r=im.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth});return visible.length&&visible.every(im=>im.complete&&im.naturalWidth>0)}",arg=selector,timeout=20000)

async def run():
 results=[]
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  for width in [390,1440]:
   for gender in ['female','male']:
    page=await browser.new_page(viewport={'width':width,'height':1000});errors=[];requests=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:requests.append(request.url) if request.resource_type=='image' else None)
    await page.route('**/api/**',lambda route:route.abort())
    await page.goto(BASE+'/scripts/fixtures/easy-picker-previews.html?gender='+gender)
    await expect(page.get_by_role('button',name='ทรงผม',exact=True)).to_be_visible()
    session=await page.context.new_cdp_session(page)
    await session.send('Network.enable')
    await session.send('Network.emulateNetworkConditions',{'offline':False,'latency':120,'downloadThroughput':96*1024,'uploadThroughput':64*1024})
    await page.get_by_role('button',name='ทรงผม',exact=True).click()
    await visible_ready(page,'.easy-hair-thumbnail img')
    sources=await page.locator('.easy-hair-thumbnail img').evaluate_all('images=>images.map(im=>im.getAttribute("src"))')
    assert sources and all('/hair-picker-thumbnails/' in src for src in sources),sources
    hair_count=len(sources)
    await page.locator('.easy-hair-thumbnail').first.click()
    await page.get_by_role('button',name='ชุด',exact=True).click()
    await visible_ready(page,'.easy-suit-category-grid img')
    await page.get_by_role('button',name='ข้าราชการ',exact=True).click()
    await visible_ready(page,'.easy-suit-grid img')
    sources=await page.locator('.easy-suit-grid img').evaluate_all('images=>images.map(im=>im.getAttribute("src"))')
    assert all('/uniform-picker-thumbnails/' in src for src in sources),sources
    await page.locator('.easy-suit-grid button').first.hover()
    await page.locator('.easy-suit-grid button').first.click()
    await page.get_by_role('button',name='พื้นหลัง',exact=True).click()
    started=time.monotonic()
    await visible_ready(page,'.easy-backgrounds img')
    background_ms=round((time.monotonic()-started)*1000)
    assert await page.locator('.easy-backgrounds img').evaluate_all('images=>images.every(im=>im.src.startsWith("data:image/webp;base64,"))')
    await page.locator('.easy-backgrounds button').nth(1).click()
    calls=await page.evaluate('pickerFixture.calls')
    expected=await page.evaluate('({hair:pickerFixture.hairs[0],suit:pickerFixture.templates[0],background:pickerFixture.backgrounds[1]})')
    assert calls==[{'kind':kind,'option':expected[kind]} for kind in ['hair','suit','background']],calls
    assert not any('/uniform-quick-previews/' in url or '/background-options/' in url or '/assets/background.jpg' in url for url in requests),requests
    assert not any('/assets/'+kind+'-uniforms/' in url for kind in ['job','government','student','gown'] for url in requests),requests
    assert not any('/seedream-hairstyles/previews/' in url or '/hairstyle-previews/' in url for url in requests),requests
    assert not errors,errors
    results.append({'width':width,'gender':gender,'hairTiles':hair_count,'nativeMenuDownloads':0,'backgroundReadyMs':background_ms,'selectionPreserved':True,'errors':errors})
    await page.close()
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  await page.goto(BASE+'/scripts/fixtures/easy-picker-previews.html?gender=male')
  original=await page.evaluate('pickerFixture.hairs[1].src')
  # One failed menu thumbnail falls back to its original catalog preview.
  await page.route('**/hair-picker-thumbnails/**',lambda route:route.abort())
  await page.get_by_role('button',name='ทรงผม',exact=True).click()
  await page.wait_for_function('source=>[...document.querySelectorAll(".easy-hair-thumbnail img")].some(im=>im.dataset.fallback==="1"&&im.getAttribute("src")===source&&im.complete&&im.naturalWidth>0)',arg=original,timeout=20000)
  results.append({'missingThumbnailFallback':'PASS'})
  await page.close();await browser.close()
 print(json.dumps(results,ensure_ascii=False))

asyncio.run(run())
