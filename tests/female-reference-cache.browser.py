"""Actual same-hair Create action must not treat older file content as current."""
import os,re,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5227')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for revision in ['old','current']:
  p=b.new_page(viewport={'width':1280,'height':1000})
  def expose(route):
   r=route.fetch();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__hairUi={open:()=>{setPicker('hair');setToolRailOpen(true)},ready:ready&&!assetBusy&&!processActive};\n const openBackgroundColor=()=>{",r.text(),count=1);route.fulfill(response=r,body=s)
  p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html?reference-finish='+revision);p.wait_for_function('window.__hairUi?.ready');p.wait_for_timeout(500);p.evaluate('__hairUi.open()')
  p.get_by_role('button',name='เลือกทรงผมหญิง ทดสอบสั้นฟรี',exact=True).click();p.get_by_role('button',name='สร้างภาพ',exact=True).click()
  if revision=='old':p.wait_for_function('restoredHairCalls.length===1')
  else:
   p.wait_for_timeout(500);assert p.evaluate('restoredHairCalls.length')==0
  print(json.dumps({'reference':revision,'processingRequested':revision=='old','unchangedCurrentResultReused':revision=='current'}),flush=True);p.close()
 b.close()
