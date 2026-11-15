"""Actual App preparation, POST, polling and paired-image receipt in both languages.

Only the API is intercepted; the App, image bytes, models, FormData and fetch
deadline implementation are real. Faults never create extra generation POSTs.
"""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5204')
OUT=Path(os.environ.get('SELECTION_OUTPUT','/tmp/portrait-transfer-browser'))
OUT.mkdir(parents=True,exist_ok=True)
ROOT=Path(__file__).resolve().parents[1]
PNG=(ROOT/'public/assets/job-uniforms/female-formal-suit-example.png').read_bytes()
reports=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['en','th']:
  page=browser.new_page()
  page.set_default_timeout(90000)
  errors=[];posts=[];counts={}
  page.on('pageerror',lambda e:errors.append(str(e)))
  def expose(route):
   response=route.fetch()
   route.fulfill(response=response,body=response.text()+'''\nwindow.__transferTest={aiFinishPortraitUncached,levelPortraitCutout,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION,AI_MAKEUP_PAIR_VERSION};''')
  page.route('**/src/main.jsx*',expose)
  def api(route):
   path=route.request.url.split(BASE)[-1]
   if path=='/api/ai-jobs':
    data=route.request.post_data_buffer or b''
    posts.append({'bytes':len(data),'contentType':route.request.headers.get('content-type'),'files':data.count(b'filename=')})
    route.fulfill(status=202,json={'jobId':'job_'+'a'*36,'downloadWorkId':'dwork_'+'b'*36,'trialPreview':True});return
   if path.endswith('/rights'):
    route.fulfill(status=200,json={'unlocked':False,'fullEdit':False});return
   if path.startswith('/api/ai-jobs/job_'):
    counts[path]=counts.get(path,0)+1
    if '/result' in path:
     if path.endswith('/result') and counts[path]==1:route.abort('connectionreset');return
     if path.endswith('finish=makeup') and counts[path]==1:route.fulfill(status=503,body='temporary interruption');return
     route.fulfill(status=200,body=PNG,headers={'Content-Type':'image/png','X-IDPROM-Trial':'1'});return
    if counts[path]==1:route.fulfill(status=503,body='temporary interruption');return
    versions=page.evaluate('({skin:__transferTest.ORIGINAL_PORTRAIT_AI_VERSION,natural:__transferTest.NATURAL_STUDIO_SKIN_VERSION,english:__transferTest.ENGLISH_TEMPLATE_BODY_FINISH_VERSION,pair:__transferTest.AI_MAKEUP_PAIR_VERSION})')
    route.fulfill(status=200,json={'status':'completed','stage':'makeup','portraitMode':'female','femaleEyeStyle':'natural','hasMakeupVariant':True,'studioSkinVersion':versions['skin'],'naturalFinishVersion':versions['natural'],**({'portraitComposition':'en-outfit-body-v1','englishStudioFinishVersion':versions['english']} if lang=='en' else {})});return
   route.fulfill(status=200,json={'walletId':'test-wallet','generationRemaining':5,'trialRemaining':3,'processRemaining':5})
  page.route('**/api/**',api)
  page.goto(BASE+'/?lang='+lang,wait_until='domcontentloaded')
  page.wait_for_function('!!window.__transferTest')
  result=page.evaluate('''async()=>{
   const blob=await(await fetch('/assets/job-uniforms/female-formal-suit-example.png')).blob();
   const source=new File([blob],'original.png',{type:'image/png'}),results=[];
   const fingerprint=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
   for(const hair of [location.search.includes('en')?'seedream-54':'seedream-41',location.search.includes('en')?'seedream-55':'seedream-40']){
    const output=await __transferTest.aiFinishPortraitUncached(source,hair,{portraitMode:'female',femaleEyeStyle:'natural',requiresSegmentation:!location.search.includes('en'),templatePath:'/assets/job-uniforms/female-formal-suit.png'});
    results.push({job:output.idpromJobId,hash:await fingerprint(output),makeupHash:await fingerprint(output.idpromAiMakeupBlob)});
   }
   return {sourceHash:await fingerprint(source),naturalHash:await fingerprint(location.search.includes('en')?source:await __transferTest.levelPortraitCutout(source)),results};
  }''')
  assert len(posts)==2,'Connection recovery must never regenerate'
  assert posts[0]['files']==1,'Upload the original only once'
  assert posts[1]['contentType']=='application/json' and posts[1]['bytes']<10000,'Hairstyle changes reuse the stored original'
  assert all(r['hash']==result['naturalHash'] and r['makeupHash']==result['naturalHash'] for r in result['results']),'Both received image files retain their bytes'
  assert not errors,errors
  reports.append({'language':lang,'passed':True,'posts':posts,'jobStatusAndResultsRecovered':True,'bothFinishFilesExact':True})
  print(json.dumps(reports[-1]),flush=True)
  page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(reports,indent=2))
