"""Cancel real in-flight browser fetches; isolate account and tab job state."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5204')
OUT=Path(os.environ.get('SELECTION_OUTPUT','/tmp/portrait-operation-browser'));OUT.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for language in ['en','th']:
  page=browser.new_page();posts=[];reads=[];held=[];errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.add_init_script("localStorage.setItem('idprom-active-ai-job-v1',JSON.stringify({jobId:'other-tab-job'}))")
  def expose(route):
   r=route.fetch();route.fulfill(response=r,body=r.text()+'''\nwindow.__opTest={createPortraitOperation,portraitOperationScope,assertProcessActive,readExistingAiJob,cancelPortraitJob,settleProcessOperation,writeActiveAiJob,readActiveAiJob,setWallet:id=>appStorage.setItem(WALLET_KEY,id)};''')
  def api(route):
   url=route.request.url
   if '/api/ai-jobs/' in url:
    if route.request.method=='GET':reads.append(url);held.append(route);return
    posts.append({'url':url,'wallet':route.request.headers.get('x-wallet-id')});route.fulfill(status=200,json={'ok':True});return
   assert not(url.endswith('/api/ai-jobs') and route.request.method=='POST'),'Never create an AI generation in this test'
   route.fulfill(status=200,json={'walletId':'fixture-wallet','generationRemaining':4,'processRemaining':4,'trialRemaining':3})
  page.route('**/src/main.jsx*',expose);page.route('**/api/**',api)
  page.goto(BASE+'/?lang='+language,wait_until='domcontentloaded');page.wait_for_function('!!window.__opTest')
  page.wait_for_timeout(80)
  assert page.evaluate('__opTest.readActiveAiJob()?.jobId')=='other-tab-job','A new page must not erase another tab active job'
  outcome=page.evaluate('''async()=>{
   const qa=window.__opTest,results=[];
   for(const changeAccount of [false,true]){
    const operation=qa.createPortraitOperation({scope:qa.portraitOperationScope(),headers:{'X-Wallet-Id':'original-owner'}});
    operation.jobId='job_cancel_fixture';qa.writeActiveAiJob({jobId:'other-tab-job'});
    const start=performance.now();
    const pending=qa.readExistingAiJob(operation.jobId,'','poll_job','json',operation).then(()=>({unexpected:true}),e=>({code:e.code}));
    await new Promise(resolve=>setTimeout(resolve,50));
    if(changeAccount){qa.setWallet('changed-owner');try{qa.assertProcessActive(operation)}catch(e){if(e.code!=='USER_CANCELLED')throw e}}else operation.cancelled=true;
    await qa.cancelPortraitJob(operation,()=>qa.settleProcessOperation(operation,'cancel'));
    const result=await pending;
    if(result.code!=='USER_CANCELLED'||!operation.readController.signal.aborted)throw Error('Old read was not cancelled');
    if(qa.readActiveAiJob()?.jobId!=='other-tab-job')throw Error("Another tab active job was cleared");
    results.push({changeAccount,elapsedMs:Math.round(performance.now()-start),cancelled:true});
   }
   return results;
  }''')
  assert all(r['elapsedMs']<1500 for r in outcome),outcome
  assert len(reads)==2 and len(posts)==2,(reads,posts)
  assert all(p['wallet']=='original-owner' and p['url'].endswith('/cancel') for p in posts),posts
  assert not errors,errors
  results.append({'language':language,'passed':True,'checks':outcome,'wrongOwnerRequests':0,'extraGenerationRequests':0})
  print(json.dumps(results[-1]),flush=True)
  for route in held:
   try:route.abort()
   except Exception:pass
  page.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
