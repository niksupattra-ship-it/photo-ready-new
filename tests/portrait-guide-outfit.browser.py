import json,re,os
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5205')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  for kind in ['job','government','gown','student']:
   print('Checking',width,kind,flush=True)
   p=b.new_page(viewport={'width':width,'height':1000});errors=[]
   p.on('pageerror',lambda e:errors.append(str(e)))
   def expose(route):
    r=route.fetch();s=r.text();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__guideChooser={choose:id=>selectAsset('suit',templates.find(t=>t.id===id)),ready:ready&&!assetBusy&&!processActive};\n const openBackgroundColor=()=>{",s,count=1)
    route.fulfill(response=r,body=s)
   p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
   p.goto(base+'/scripts/fixtures/female-outfit-guide.html');p.wait_for_function('window.__guideChooser?.ready')
   p.wait_for_timeout(500)
   p.evaluate('(id)=>__guideChooser.choose(id)',kind)
   p.locator('#studio-history-title').wait_for(timeout=30000)
   assert p.evaluate('guideCalls.length')==0
   p.get_by_role('button',name='ประมวลผลต่อ',exact=True).click()
   p.wait_for_function('guideCalls.length===1')
   call=p.evaluate('guideCalls[0]');assert call['original'] and call['gender']=='female' and call['hair']=='seedream-05',call
   assert '/'+({'job':'job-uniforms','government':'government-uniforms','gown':'gown-uniforms','student':'student-uniforms'}[kind])+'/' in call['template'],call
   assert call['options']['sourceJobId']=='accepted-job',call
   assert not errors,errors
   p.close()
 b.close()
print(json.dumps({'passed':True,'widths':[390,1280],'categories':['job','government','gown','student'],'confirmation_preserves_original_outfit_hair':True,'paid_calls':0}))
