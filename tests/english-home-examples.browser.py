import os,pathlib,json
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193');out=pathlib.Path('/tmp/english-home-examples');out.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for width in [390,1440]:
  p=b.new_page(viewport={'width':width,'height':1100});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else r.abort())
  for english in [True,False]:
   p.goto(base+'/scripts/fixtures/english-home-examples.html'+('?lang=en' if english else ''),wait_until='networkidle')
   assert p.locator('.english-example-photo').count()==(3 if english else 0)
   if english:
    assert p.locator('.easy-landing-samples [data-example="original"]').count()==1
    assert p.locator('.studio-featured-list .english-example-photo').count()==0
    assert p.locator('.studio-featured-list img[src*="job-uniforms--"]').count()==5
    bounds=p.locator('.english-example-photo').evaluate_all('(items)=>items.map(x=>{const b=x.getBoundingClientRect();return {w:b.width,h:b.height,right:b.right}})')
    assert all(x['w']>20 and x['h']>20 and x['right']<=width+1 for x in bounds),bounds
    p.screenshot(path=str(out/f'english-{width}.png'),full_page=True)
   else:
    assert p.locator('.easy-landing-samples img[src*="easy-government"]').count()==1
   assert not errors,errors
   results.append({'width':width,'english':english,'scopedExamples':True})
  p.close()
 print(json.dumps(results));b.close()
