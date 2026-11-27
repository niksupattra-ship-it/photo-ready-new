"""Simulate a tab holding an older free-short-hair file. Uses the mocked lab server."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('PRODUCTION_LAB_BASE','http://127.0.0.1:5226')
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 p=b.new_page(viewport={'width':1280,'height':1000});p.goto(BASE+'/female-production-lab.html')
 p.locator('input[name=person]').set_input_files(str(ROOT/'public/assets/home-previews/easy-original-v20261031.webp'))
 def choose(kind,id):
  p.locator('[data-catalogue='+kind+']').click();p.locator('[data-catalogue-id="'+id+'"]').click();p.locator('#catalogue-dialog').wait_for(state='hidden')
 choose('outfit','female-operational');choose('hair','seedream-42')
 expected=p.evaluate('''async()=>{
 const catalogue=await(await fetch('/seedream-pro-lab-catalogue.json')).json(),item=catalogue.hairs.find(x=>x.id==='seedream-42');
 const old=await(await fetch('/assets/seedream-hairstyles/references/14.png')).blob();
 const stale=new File([old],'42.png',{type:'image/png'}),input=document.querySelector('input[name=hair]'),transfer=new DataTransfer();transfer.items.add(stale);input.files=transfer.files;input.catalogueFile=input.files[0];input.dataset.catalogueId=item.id;input.dataset.catalogueReference=item.reference;input.dataset.catalogueSha256='old-hash';input.dispatchEvent(new Event('change'));
 const data=new FormData(document.querySelector('#form'));
 if(data.get('hair')!==input.catalogueFile)throw Error('Fixture must retain selected File identity');
 return item.sha256;
 }''')
 p.locator('input[name=key]').fill('inert-key');p.locator('#go').click();p.locator('#results .result').wait_for(timeout=120000)
 result=p.request.get(BASE+'/api/test-references').json();assert result['hashes'][2]==expected,result
 p.get_by_role('button',name='สร้างอีกครั้ง',exact=True).click();p.wait_for_function('document.querySelectorAll("#results .result").length===2',timeout=120000)
 again=p.request.get(BASE+'/api/test-references').json();assert again['hashes'][2]==expected,again
 print(json.dumps({'freeShortHair':'seedream-42','staleFileRefreshedBeforeAI':True,'regenerateKeepsCurrentFile':True,'realProviderCalls':0}));b.close()
