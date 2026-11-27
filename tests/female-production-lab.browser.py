"""Run scripts/fixtures/female-production-lab-server.mjs first; no paid AI calls."""
from playwright.sync_api import sync_playwright
import json,os
from pathlib import Path
BASE=os.environ.get("PRODUCTION_LAB_BASE","http://127.0.0.1:5215")
SOURCE=str(Path(__file__).resolve().parents[1]/"public/assets/home-previews/easy-original-v20261031.webp")
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1280]:
  p=b.new_page(viewport={'width':width,'height':950});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(BASE+'/female-production-lab.html');p.wait_for_function("document.querySelector('#prompt').value.length>100")
  assert p.locator('#prompt').get_attribute('readonly') is not None
  p.locator('input[name=person]').set_input_files(SOURCE)
  def choose(kind,id):
   p.locator('[data-catalogue='+kind+']').click();p.locator('[data-catalogue-id="'+id+'"]').click();p.locator('#catalogue-dialog').wait_for(state='hidden')
  choose('outfit','female-operational');choose('hair','seedream-05')
  p.wait_for_function("!document.querySelector('#guide-image').hidden",timeout=120000)
  initial=p.locator('#guide-image').get_attribute('src')
  choose('outfit','female-job-navy-notch-white-shirt')
  p.wait_for_function('(old)=>{const im=document.querySelector("#guide-image");return !im.hidden&&im.src!==old}',arg=initial,timeout=90000)
  choose('hair','seedream-14')
  p.locator('input[name=key]').fill('inert-browser-key');p.locator('#go').click()
  p.locator('#results .result').wait_for(timeout=90000)
  p.wait_for_function('document.querySelector("#results img").naturalWidth===900')
  assert p.locator('#results img').evaluate('(im)=>im.naturalHeight')==1200
  assert not errors,errors
  p.screenshot(path='/tmp/female-production-lab-'+str(width)+'.png',full_page=True)
  print(json.dumps({'width':width,'catalogue_switches':True,'guide_rebuilt':True,'result':[900,1200],'provider':'mock'}),flush=True)
  p.close()
 b.close()
