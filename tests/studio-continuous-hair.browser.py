"""Real Studio controls: immediate hair swaps, explicit new outfit cycles. No provider calls."""
import os,re,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  def expose(route):
   r=route.fetch();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__cycle={open:kind=>{setPicker(kind);setToolRailOpen(true)},ready:ready&&!assetBusy&&!processActive,head:state.current.find(l=>l.kind==='head')};\n const openBackgroundColor=()=>{",r.text(),count=1);route.fulfill(response=r,body=s)
  p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html?continuous=1&cached-hair=1');p.wait_for_function('__cycle.ready');p.wait_for_timeout(500)
  def hair(number):
   p.evaluate("__cycle.open('hair')");p.get_by_role('button',name='เลือกทรงผมหญิง ทดสอบ '+str(number),exact=True).click()
  hair(6);p.wait_for_function('restoredHairCalls.length===1&&__cycle.ready');assert p.evaluate('guideCalls.length')==0
  assert p.evaluate('restoredHairCalls[0][3]')=='/assets/government-uniforms/female-academic.png'
  for i,(name,template) in enumerate([('job','/assets/job-uniforms/female-job-navy-notch-white-shirt.png'),('student','/assets/student-uniforms/female-01.png')]):
   p.evaluate("__cycle.open('suit')");p.get_by_role('button',name='ใส่ชุดด้วย AI '+name,exact=True).click()
   expect(p.get_by_text('กรุณาเลือกทรงผม',exact=True).first).to_be_visible();assert p.get_by_role('button',name='สร้างชุดด้วย AI',exact=True).count()==0
   count=p.evaluate('restoredHairCalls.length');hair(5);expect(p.get_by_role('button',name='สร้างชุดด้วย AI',exact=True)).to_be_visible()
   assert p.evaluate('restoredHairCalls.length')==count;assert p.evaluate('guideCalls.length')==i
   p.get_by_role('button',name='สร้างชุดด้วย AI',exact=True).click();p.wait_for_function('(n)=>guideCalls.length===n&&__cycle.ready',arg=i+1)
   assert p.evaluate('__cycle.head.generatedOutfitTemplate')==template
   hair(6);p.wait_for_function('(n)=>restoredHairCalls.length===n&&__cycle.ready',arg=count+1)
   assert p.evaluate('restoredHairCalls.at(-1)[3]')==template
  assert not errors,errors
  print(json.dumps({'width':width,'immediateSameOutfitHair':True,'explicitOutfitCycles':2,'newOutfitRetainedForHair':True,'providerCalls':0}),flush=True);p.close()
 b.close()
