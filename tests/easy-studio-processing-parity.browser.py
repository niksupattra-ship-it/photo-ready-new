"""Compare real Easy and Studio handler requests for the identical accepted upload/outfit/hair."""
import os,re,json
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  requests=[]
  for mode in ['easy','studio']:
   p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   def expose(route):
    r=route.fetch();s=re.sub(r'const openBackgroundColor\s*=\s*\(\)\s*=>\s*\{'," window.__parity={choose:id=>chooseHair(id),confirm:()=>confirmThaiHair(),ready:ready&&!assetBusy&&!processActive,pending:thaiPendingHair,flow:thaiChoiceFlow,head:state.current.find(l=>l.kind==='head')};\n const openBackgroundColor=()=>{",r.text(),count=1);route.fulfill(response=r,body=s)
   p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
   p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html?continuous=1'+('&easy=1' if mode=='easy' else ''));p.wait_for_function('__parity.ready');p.wait_for_timeout(400)
   p.evaluate("__parity.choose('seedream-06')")
   if mode=='easy':
    p.wait_for_function("__parity.pending?.hairId==='seedream-06'&&__parity.flow?.step==='ready'");assert p.evaluate('restoredHairCalls.length')==0;p.evaluate('__parity.confirm()')
   p.wait_for_function('restoredHairCalls.length===1&&__parity.ready')
   requests.append(p.evaluate('({args:restoredHairCalls[0],source:__parity.head.source,frame:__parity.head.sourceFrame,outfit:__parity.head.generatedOutfitTemplate,finish:__parity.head.femaleEyeStyle})'))
   assert p.evaluate('guideCalls.length')==0;assert not errors,errors;p.close()
  assert requests[0]==requests[1],'The identical accepted outfit/hair must have the same request, image source and placement'
  print(json.dumps({'width':width,'sameHairRequest':True,'sameResultPixelsAndFrame':True,'providerCalls':0}),flush=True)
 b.close()
