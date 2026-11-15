"""Actual App preparation, POST, polling and paired-image receipt in both languages.

Only the API is intercepted; the App, image bytes, models, FormData and fetch
deadline implementation are real. Faults never create extra generation POSTs.
"""
import os,json,re,hashlib
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
 for lang,gender in [(lang,gender)for lang in ['en','th']for gender in ['female','male']]:
  PNG=(ROOT/'public/assets/job-uniforms'/('male-formal-tie-suit-example.png'if gender=='male'else'female-formal-suit-example.png')).read_bytes()
  page=browser.new_page()
  page.add_init_script('''window.legacyJobWrites=0;const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{if(name==='idprom-ai-jobs-v1'){window.legacyJobWrites++;throw Error('Legacy storage unavailable')}return open(name,...args)}''')
  page.set_default_timeout(90000)
  errors=[];posts=[];counts={};receipts={};receipt_reads=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def expose(route):
   response=route.fetch()
   route.fulfill(response=response,body=response.text()+'''\nwindow.__transferTest={aiFinishPortraitUncached,levelPortraitCutout,ORIGINAL_PORTRAIT_AI_VERSION,NATURAL_STUDIO_SKIN_VERSION,ENGLISH_TEMPLATE_BODY_FINISH_VERSION,AI_MAKEUP_PAIR_VERSION};''')
  page.route('**/src/main.jsx*',expose)
  def api(route):
   path=route.request.url.split(BASE)[-1]
   if path=='/api/ai-jobs':
    data=route.request.post_data_buffer or b''
    content_type=route.request.headers.get('content-type','')
    fields=json.loads(data)if 'application/json'in content_type else {}
    submission=fields.get('clientSubmissionId')or re.search(rb'name="clientSubmissionId"\r\n\r\n([a-z0-9_]+)\r\n',data)[1].decode()
    job='job_'+hashlib.sha256(submission.encode()).hexdigest()[:36]
    info={'jobId':job,'downloadWorkId':'dwork_'+'b'*36,'trialPreview':True}
    receipts[submission]=info
    posts.append({'bytes':len(data),'contentType':content_type,'files':data.count(b'filename='),'submission':submission,'canonicalReuse':fields.get('reuseCanonicalInput')})
    if len(posts)==1:route.abort('connectionreset');return
    route.fulfill(status=202,json=info);return
   if path.startswith('/api/ai-submissions/'):
    submission=path.rsplit('/',1)[-1];receipt_reads.append(submission)
    if len(receipt_reads)==1:route.fulfill(status=503,body='restarting');return
    route.fulfill(status=200,json=receipts[submission]);return
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
    route.fulfill(status=200,json={'status':'completed','stage':'makeup','portraitMode':gender,'femaleEyeStyle':'natural','hasMakeupVariant':gender=='female','studioSkinVersion':versions['skin'],'naturalFinishVersion':versions['natural'],**({'portraitComposition':'en-outfit-body-v1','englishStudioFinishVersion':versions['english']} if lang=='en' else {})});return
   route.fulfill(status=200,json={'walletId':'test-wallet','generationRemaining':5,'trialRemaining':3,'processRemaining':5})
  page.route('**/api/**',api)
  page.goto(BASE+'/?lang='+lang,wait_until='domcontentloaded')
  page.wait_for_function('!!window.__transferTest')
  result=page.evaluate('''async gender=>{
   const blob=await(await fetch('/assets/job-uniforms/'+(gender==='male'?'male-formal-tie-suit-example.png':'female-formal-suit-example.png'))).blob();
   const source=new File([blob],'original.png',{type:'image/png'}),results=[];
   const fingerprint=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
   for(const hair of gender==='male'?[location.search.includes('en')?'seedream-64':'seedream-28',location.search.includes('en')?'seedream-65':'seedream-36']:[location.search.includes('en')?'seedream-54':'seedream-41',location.search.includes('en')?'seedream-55':'seedream-40']){
    const output=await __transferTest.aiFinishPortraitUncached(source,hair,{portraitMode:gender,femaleEyeStyle:'natural',requiresSegmentation:!location.search.includes('en'),templatePath:'/assets/job-uniforms/female-formal-suit.png'});
    results.push({job:output.idpromJobId,hash:await fingerprint(output),makeupHash:output.idpromAiMakeupBlob?await fingerprint(output.idpromAiMakeupBlob):null});
   }
   return {sourceHash:await fingerprint(source),naturalHash:await fingerprint(location.search.includes('en')?source:await __transferTest.levelPortraitCutout(source)),results};
  }''',gender)
  assert len(posts)==2,'Connection recovery must never regenerate'
  assert posts[0]['files']==(1 if gender=='female'else 2),'Only the first request uploads image files'
  assert posts[1]['contentType']=='application/json' and posts[1]['bytes']<10000,'Hairstyle changes reuse the stored original'
  assert all(r['hash']==result['naturalHash'] and (r['makeupHash']==result['naturalHash'] if gender=='female'else r['makeupHash'] is None) for r in result['results']),'Both received image files retain their bytes'
  assert len(receipt_reads)==2 and receipt_reads[0]==posts[0]['submission'];assert posts[0]['submission']!=posts[1]['submission']
  if gender=='male':assert posts[1]['canonicalReuse']=='1'
  assert not errors,errors
  reports.append({'language':lang,'gender':gender,'passed':True,'lostSubmissionRecovered':True,'posts':posts,'jobStatusAndResultsRecovered':True,'bothFinishFilesExact':True,'legacyStorageUnavailable':True})
  print(json.dumps(reports[-1]),flush=True)
  page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(reports,indent=2))
