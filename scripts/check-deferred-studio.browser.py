"""Built app chunk loading, failure/retry and unmount regression. All requests local."""
import json,pathlib,mimetypes,time,io
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'work/performance-third-pass';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='https://idprom-preview.invalid'
manifest=json.loads((ROOT/'dist/.vite/manifest.json').read_text())
chunk='/'+next(value['file']for value in manifest.values()if value.get('src')=='src/studio-editor.jsx')
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for language,with_source in [('th',False),('en',False),('th',True),('en',True)]:
  context=browser.new_context(viewport={'width':1280,'height':900});p=context.new_page();p.set_default_timeout(15000)
  requested=[];errors=[];state={'fail':True,'chunkAttempts':0};api=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  def fixture(r):
   url=r.request.url
   if not url.startswith(ORIGIN+'/'):r.fulfill(status=204,body='');return
   name=url.split(ORIGIN,1)[1].split('?')[0]
   if name.startswith('/api/'):
    api.append({'path':name,'method':r.request.method})
    r.fulfill(content_type='application/json',body=json.dumps({'ok':True,'walletId':'wallet_fixture','items':[],'trialRemaining':2,'trialAvailable':True,'unlockedJobIds':[],'editableJobIds':[],'revision':'1234567890abcdef12345678'}));return
   requested.append(name)
   if name==chunk:
    state['chunkAttempts']+=1
    if state['fail']:r.abort('failed');return
   file=ROOT/'dist'/name.lstrip('/')
   if not file.is_file():file=ROOT/'dist/index.html'
   r.fulfill(content_type=mimetypes.guess_type(str(file))[0]or'application/octet-stream',body=file.read_bytes())
  p.route('**/*',fixture);p.goto(ORIGIN+('/?lang=en'if language=='en'else'/'),wait_until='load')
  expect(p.locator('.easy-primary')).to_be_enabled();assert chunk not in requested,'Studio was eagerly loaded'
  p.screenshot(path=str(OUT/('home-'+language+'.png')))
  if with_source:
   buffer=io.BytesIO();Image.new('RGB',(120,160),'#6499aa').save(buffer,format='PNG')
   with p.expect_file_chooser() as chosen:p.locator('.easy-primary').click()
   chosen.value.set_files({'name':'portrait.png','mimeType':'image/png','buffer':buffer.getvalue()})
  else:p.locator('.easy-studio').click()
  retry=p.get_by_role('button',name='Try again'if language=='en'else'ลองอีกครั้ง',exact=True)
  expect(retry).to_be_visible();assert state['chunkAttempts']==1
  assert not p.locator('.idstudio.studio-redesign').count()
  state['fail']=False;retry.click()
  if with_source:
   p.locator('.idstudio .easy-mode:not(.easy-landing-page)').wait_for()
   expect(p.locator('.easy-source-photo')).to_be_visible()
   p.wait_for_function("document.querySelector('.easy-source-photo')?.naturalWidth===120")
  else:p.locator('.idstudio.studio-redesign').wait_for()
  assert state['chunkAttempts']==2,state
  if not with_source:expect(p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if language=='en'else'ชุด',exact=True)).to_be_visible()
  # Network failure is handled in the loading boundary, not an uncaught page exception.
  assert not errors,errors
  assert not [x for x in api if any(w in x['path']for w in ['ai-','makeup','hairstyle','promptpay'])],api
  results.append({'language':language,'uploadedSourceRetained':with_source,'homeDoesNotFetchStudio':True,'failedImportRetryOpensStudio':True,'chunkRequests':state['chunkAttempts'],'uncaughtErrors':errors})
  context.close()
 browser.close()
(OUT/'chunk-loading.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
