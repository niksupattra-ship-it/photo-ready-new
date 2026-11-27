"""Actual first-generation callbacks in Easy and Studio, with the same unprocessed upload."""
import os,re,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  results=[]
  for mode in ['easy','studio']:
   p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def expose(route):
    r=route.fetch();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__first={gender:()=>selectEasyPhotoType('female'),choose:id=>chooseHair(id),confirm:()=>confirmThaiHair(),generate:id=>processEasyPhoto(id),pending:thaiPendingHair,flow:thaiChoiceFlow,ready:ready&&!assetBusy&&!processActive,head:state.current.find(l=>l.kind==='head')};\n const openBackgroundColor=()=>{",r.text(),count=1);route.fulfill(response=r,body=s)
   p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
   p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html?continuous=1&first=1'+('&easy=1' if mode=='easy' else ''));p.wait_for_function('__first.ready');p.wait_for_timeout(400)
   p.evaluate("__first.gender()");p.wait_for_timeout(100)
   p.evaluate("__first.choose('seedream-06')");p.wait_for_function("__first.pending?.hairId==='seedream-06'&&__first.flow?.step==='ready'")
   p.evaluate("__first.generate('seedream-06')" if mode=='easy' else '__first.confirm()');p.wait_for_function('guideCalls.length===1&&__first.ready')
   results.append(p.evaluate('({request:guideCalls[0],source:__first.head.source,frame:__first.head.sourceFrame,mode:__first.head.portraitMode,finish:__first.head.femaleEyeStyle})'))
   assert p.evaluate('restoredHairCalls.length')==0;assert not errors,errors;p.close()
  assert results[0]==results[1],'First creation must submit the same original, garment, hairstyle and options and render the same mocked result'
  assert results[0]['request']['original']
  print(json.dumps({'width':width,'firstRequestAndOriginalUploadEqual':True,'sameMockedResultAndPlacement':True,'providerCalls':0}),flush=True)
 b.close()
