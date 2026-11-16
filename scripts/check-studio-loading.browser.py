"""Built app: deferred editor download, photo retention, and retry on mobile/desktop.
Uses local image/API fixtures; never contacts payment, AI or customer services.
"""
import asyncio, io, json, mimetypes, pathlib
from PIL import Image
from playwright.async_api import async_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIGIN = 'https://studio-loading.invalid'
buffer = io.BytesIO()
Image.new('RGB', (120, 160), '#6e96af').save(buffer, format='PNG')
PHOTO = buffer.getvalue()

async def run():
 results = []
 async with async_playwright() as pw:
  browser = await pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
  for width in [390, 1440]:
   for fail_first in [False, True]:
    context = await browser.new_context(viewport={'width': width, 'height': 900})
    page = await context.new_page()
    errors, calls, chunks = [], [], []
    blocked = fail_first
    page.on('pageerror', lambda error: errors.append(str(error)))
    async def fixture(route):
     url = route.request.url
     if not url.startswith(ORIGIN + '/'):
      await route.fulfill(status=204, body=''); return
     path = url[len(ORIGIN):].split('?')[0]
     if path.startswith('/api/'):
      calls.append(path)
      await route.fulfill(content_type='application/json', body=json.dumps({'ok': True, 'walletId': 'wallet_fixture', 'items': [], 'trialRemaining': 2, 'trialAvailable': True, 'unlockedJobIds': [], 'editableJobIds': [], 'generationRemaining': 0, 'revision': '1234567890abcdef12345678'})); return
     if path.startswith('/assets/studio-editor-') and path.endswith('.js'):
      chunks.append(path)
      if blocked:
       await route.abort('internetdisconnected'); return
      await asyncio.sleep(0.3)
     file = ROOT / 'dist' / path.lstrip('/')
     if not file.is_file(): file = ROOT / 'dist/index.html'
     await route.fulfill(content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream', body=file.read_bytes())
    await page.route('**/*', fixture)
    await page.goto(ORIGIN, wait_until='networkidle')
    await expect(page.locator('.easy-primary')).to_be_enabled()
    assert not chunks, 'The landing page must not download the Studio chunk'
    async with page.expect_file_chooser() as chooser:
     await page.locator('.easy-primary').click()
    await (await chooser.value).set_files({'name': 'portrait.png', 'mimeType': 'image/png', 'buffer': PHOTO})
    if fail_first:
     await expect(page.get_by_role('button', name='ลองอีกครั้ง', exact=True)).to_be_visible()
     blocked = False
     await page.get_by_role('button', name='ลองอีกครั้ง', exact=True).click()
    easy = page.locator('.easy-mode:not(.easy-landing-page)')
    await expect(easy).to_be_visible(timeout=20000)
    await expect(easy.locator('.easy-source-photo')).to_be_visible()
    source = await easy.locator('.easy-source-photo').get_attribute('src')
    assert source and (source.startswith('blob:') or source.startswith('data:'))
    assert len(chunks) >= (2 if fail_first else 1), chunks
    assert not errors, errors
    assert not [path for path in calls if any(word in path for word in ['ai-jobs', 'hairstyle', 'makeup', 'promptpay'])], calls
    results.append({'width': width, 'retry': fail_first, 'homeEditorRequests': 0, 'editorRequests': len(chunks), 'photoRetained': True, 'pageErrors': errors})
    await context.close()
  await browser.close()
 print(json.dumps(results, ensure_ascii=False))

asyncio.run(run())
