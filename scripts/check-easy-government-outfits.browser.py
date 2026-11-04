"""Real built Easy-mode wizard: government choices for either portrait type.
All assets and APIs are fulfilled locally; no AI, payment or email is contacted.
"""
import io,json,pathlib,mimetypes
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent;OUT=ROOT/'work/government-outfit-fix';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='https://idprom-preview.invalid';results=[]
buf=io.BytesIO();Image.new('RGB',(120,160),'#6e96af').save(buf,format='PNG')
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking'])
 for width,height in [(390,844),(1440,1000)]:
  for gender,label in [('female','รูปผู้หญิง'),('male','รูปผู้ชาย')]:
   context=browser.new_context(viewport={'width':width,'height':height},has_touch=width<600);p=context.new_page();p.set_default_timeout(15000);errors=[];calls=[]
   p.on('pageerror',lambda e:errors.append(str(e)))
   def fixture(r):
    url=r.request.url
    if not url.startswith(ORIGIN+'/'):r.fulfill(status=204,body='');return
    path=url.split(ORIGIN,1)[1].split('?')[0]
    if path.startswith('/api/'):
     calls.append({'path':path,'method':r.request.method})
     r.fulfill(content_type='application/json',body=json.dumps({'ok':True,'walletId':'wallet_fixture','items':[],'trialRemaining':2,'trialAvailable':True,'unlockedJobIds':[],'editableJobIds':[],'generationRemaining':0,'revision':'1234567890abcdef12345678'}));return
    file=ROOT/'dist'/path.lstrip('/')
    if not file.is_file():file=ROOT/'dist/index.html'
    r.fulfill(content_type=mimetypes.guess_type(str(file))[0]or'application/octet-stream',body=file.read_bytes())
   p.route('**/*',fixture);p.goto(ORIGIN,wait_until='load');expect(p.locator('.easy-primary')).to_be_enabled()
   with p.expect_file_chooser()as chosen:p.locator('.easy-primary').click()
   chosen.value.set_files({'name':'portrait.png','mimeType':'image/png','buffer':buf.getvalue()})
   easy=p.locator('.easy-mode:not(.easy-landing-page)');expect(easy).to_be_visible();easy.get_by_role('button',name=label,exact=True).click()
   for step in range(2):easy.get_by_role('button',name='ถัดไป',exact=True).click()
   easy.get_by_role('button',name='ข้าราชการ',exact=True).click();cards=easy.locator('.easy-suit-grid button');expect(cards).to_have_count(8)
   sources=cards.locator('img').evaluate_all('imgs=>imgs.map(i=>i.getAttribute("src"))')
   assert all('/government-uniforms/'in src or 'government-uniforms--'in src for src in sources),sources
   assert all('example'not in src and '/home-previews/'not in src for src in sources),sources
   for expected in ['interior-01','interior-02','interior-03','male-government-employee','female-operational','female-academic','female-senior','female-government-employee']:
    assert any(expected in src for src in sources),expected
   search=easy.get_by_role('searchbox',name='ค้นหาชุด',exact=True);search.fill('ชาย');expect(cards).to_have_count(4);search.fill('');expect(cards).to_have_count(8)
   original=easy.locator('.easy-source-photo').get_attribute('src')
   male=cards.filter(has=p.locator('img[src*="interior-01"]'));expect(male).to_be_enabled();male.click();expect(male).to_have_attribute('aria-pressed','true')
   assert easy.locator('.easy-source-photo').get_attribute('src')==original,'Changing outfit must retain original photo'
   p.screenshot(path=str(OUT/f'government-{width}-{gender}.png'))
   assert not errors,errors
   assert not[c for c in calls if any(x in c['path']for x in ['ai-','hairstyle','makeup','promptpay'])],calls
   results.append({'width':width,'portraitType':gender,'governmentChoices':8,'maleGovernmentChoices':4,'selectMaleOutfit':True,'originalRetained':True,'uncaughtErrors':errors,'paidServiceCalls':0});context.close()
 browser.close()
(OUT/'browser-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
