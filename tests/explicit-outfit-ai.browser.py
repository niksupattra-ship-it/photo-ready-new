"""Real outfit AI/hair/Create buttons; no provider or payment requests."""
import json,re,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5219')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  for cached in [False,True]:
   p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def expose(route):
    r=route.fetch();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__outfitUi={open:()=>{setPicker('suit');setToolRailOpen(true)},ready:ready&&!assetBusy&&!processActive};\n const openBackgroundColor=()=>{",r.text(),count=1);route.fulfill(response=r,body=s)
   p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
   p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html'+('?cached-hair=1' if cached else ''))
   p.wait_for_function('window.__outfitUi?.ready');p.wait_for_timeout(500);p.evaluate('__outfitUi.open()')
   p.get_by_role('button',name='ใส่ชุดด้วย AI job',exact=True).click()
   p.get_by_role('button',name='เลือกทรงผมหญิง ทดสอบ 5',exact=True).click()
   try:p.get_by_role('button',name='สร้างชุดด้วย AI',exact=True).wait_for(timeout=10000)
   except Exception:
    print('DEBUG',errors,p.locator('body').inner_text()[-4500:],flush=True);p.screenshot(path='/tmp/explicit-outfit-fail.png');raise
   assert p.evaluate('guideCalls.length===0&&restoredHairCalls.length===0')
   p.get_by_role('button',name='สร้างชุดด้วย AI',exact=True).click()
   p.wait_for_function('guideCalls.length===1')
   call=p.evaluate('guideCalls[0]')
   assert call['original'] and call['gender']=='female' and call['hair']=='seedream-05',call
   assert call['template']=='/assets/job-uniforms/female-job-navy-notch-white-shirt.png',call
   assert call['options']['sourceJobId']=='accepted-job',call
   assert p.evaluate('restoredHairCalls.length')==0
   assert not errors,errors
   print(json.dumps({'width':width,'oldHairCached':cached,'target':call['template'],'original':True}),flush=True);p.close()
 b.close()
