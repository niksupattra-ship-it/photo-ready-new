"""New female job outfits in the real Studio/Easy selectors, Thai and English.
The local fixture uses the production catalog; no AI/account/payment requests.
"""
import json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('FEMALE_JOB_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path(os.environ.get('FEMALE_JOB_OUTPUT','/tmp/female-job-zip-browser'));OUT.mkdir(parents=True,exist_ok=True)
EXPECTED={
 'female-job-navy-collared':'Women’s navy collared jacket',
 'female-job-navy-white-collar':'Women’s navy suit with white collar',
 'female-job-black-round-collar':'Women’s black round-collar jacket',
 'female-job-tan-round-collar':'Women’s tan round-collar jacket',
 'female-job-burgundy-patterned-blouse':'Women’s burgundy suit with patterned blouse',
 'female-job-black-cream-blouse':'Women’s black jacket with cream blouse',
}
block=re.search(r'const JOB_UNIFORMS=\[[\s\S]*?\n\];',(ROOT/'src/main.jsx').read_text()).group(0)
items=[]
for line in block.splitlines():
 fields=dict(re.findall(r"(\w+):'([^']*)'",line))
 if fields.get('id')in EXPECTED:
  assert fields['cat']=='job'and fields['gender']=='female';items.append(fields)
assert len(items)==len(EXPECTED)==6
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for width,height in [(1440,1000),(390,844)]:
  for english in [False,True]:
   for easy in [False,True]:
    ctx=browser.new_context(viewport={'width':width,'height':height},has_touch=width<600)
    page=ctx.new_page();page.set_default_timeout(20000);errors=[];api=[];external=[];full_requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
     url=r.request.url
     if not url.startswith(BASE+'/'):
      external.append(url);r.abort();return
     if '/api/'in url:
      api.append(url);r.abort();return
     if any(url.split('?')[0]==BASE+x['template']for x in items):full_requests.append(url.split('?')[0])
     if '/scripts/fixtures/selection-response.jsx'in url:
      response=r.fetch();body=response.text()
      body,n=re.subn(r'jobId:\s*[\"\']fixture[\"\'],','jobId: "fixture", portraitMode: "female",',body);assert n==1
      body='import {startEnglishPreview} from "/src/english-preview.js";startEnglishPreview();\n'+body
      r.fulfill(response=response,body=body);return
     r.continue_()
    page.route('**/*',route)
    try:
     query='?'+('easy=1&'if easy else'')+('lang=en'if english else'lang=th')
     page.goto(BASE+'/scripts/fixtures/selection-response.html'+query,wait_until='domcontentloaded')
     page.wait_for_function('!!window.selectionSnapshot?.current')
     if english:expect(page.locator('html')).to_have_attribute('lang','en')
     if easy:
      root=page.locator('.easy-mode');expect(root).to_be_visible()
      root.locator('.easy-tabs').get_by_role('button',name='Outfit'if english else'ชุด',exact=True).click()
      root.get_by_role('button',name='Job application'if english else'สมัครงาน',exact=True).click()
      grid=root.locator('.easy-suit-grid')
     else:
      expect(page.locator('.idstudio')).to_be_visible()
      page.locator('.studio-bottom-choices').get_by_role('button',name='Outfit'if english else'ชุด',exact=True).click()
      grid=page.locator('.studio-catalog-grid')
     selected=[]
     for item in items:
      name=EXPECTED[item['id']]if english else item['title']
      card=grid.locator('button').filter(has=page.locator('img[src="'+item['img']+'"]'))
      expect(card).to_have_count(1);card.scroll_into_view_if_needed()
      if easy:expect(card).to_contain_text(name)
      else:expect(card).to_have_attribute('aria-label',('Choose outfit 'if english else'เลือกชุด ')+name)
      page.wait_for_function('e=>e.querySelector("img")?.complete&&e.querySelector("img")?.naturalWidth>0',arg=card.element_handle())
      preview=card.locator('img').evaluate('e=>({width:e.naturalWidth,height:e.naturalHeight})')
      assert 0<preview['width']<=512 and 0<preview['height']<=512,preview
      card.click()
      page.wait_for_function('id=>selectionSnapshot.current().layers.some(l=>l.kind==="suit"&&l.assetId===id)',arg=item['id'])
      full=page.evaluate('''async()=>{const l=selectionSnapshot.current().layers.find(l=>l.kind==='suit'),im=new Image();im.src=l.source;await im.decode();return{id:l.assetId,template:l.templatePath,width:im.naturalWidth,height:im.naturalHeight,source:l.source.slice(0,22)}}''')
      assert full['template']==item['template'],full
      assert [full['width'],full['height']]==[1504,1285],full
      assert full['source'].startswith('data:image/png;'),full
      assert BASE+item['template']in full_requests,item['template']
      expect(card).to_have_attribute('aria-pressed','true')if easy else None
      selected.append(item['id'])
     assert not errors,errors;assert not api,api;assert not external,external
     result={'viewport':[width,height],'language':'en'if english else'th','mode':'easy'if easy else'studio','selected':selected,'fullResolution':[1504,1285],'apiCalls':0,'externalRequests':0}
     results.append(result);print(json.dumps(result),flush=True)
     page.screenshot(path=str(OUT/f'{width}-{result["language"]}-{result["mode"]}.jpg'),type='jpeg',quality=65)
    except Exception:
     page.screenshot(path=str(OUT/f'failure-{width}-{english}-{easy}.jpg'),type='jpeg',quality=65);print(json.dumps({'errors':errors,'api':api,'external':external}),flush=True);raise
    finally:ctx.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'passedContexts':len(results),'outfitSelections':sum(len(x['selected'])for x in results),'apiCalls':0}))
