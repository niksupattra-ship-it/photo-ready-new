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
   p.goto(BASE+'/scripts/fixtures/female-outfit-guide.html?continuous=1'+('&easy=1' if mode=='easy' else '&posed=1'));p.wait_for_function('__parity.ready');p.wait_for_timeout(400)
   for n,hair_id in enumerate(['seedream-06','seedream-05','seedream-06','seedream-05','seedream-06','seedream-05'],1):
    p.evaluate('(id)=>__parity.choose(id)',hair_id)
    if mode=='easy':
     p.wait_for_function('(id)=>__parity.pending?.hairId===id&&__parity.flow?.step===\'ready\'',arg=hair_id)
     assert p.evaluate('restoredHairCalls.length')==0;p.evaluate('__parity.confirm()')
    p.wait_for_function('(n)=>guideCalls.length===n&&__parity.ready',arg=n)
    assert p.evaluate('guideCalls.at(-1).original') is True,'Every round must pass the upload, never the previous AI result'
   requests.append(p.evaluate('({args:guideCalls.at(-1),source:__parity.head.source,frame:__parity.head.sourceFrame,outfit:__parity.head.generatedOutfitTemplate,finish:__parity.head.femaleEyeStyle,pose:{x:__parity.head.x,y:__parity.head.y,scale:__parity.head.scale}})'))
   assert p.evaluate('restoredHairCalls.length')==0;assert not errors,errors;p.close()
  assert requests[1]['pose']=={'x':0,'y':0,'scale':1}
  assert requests[0]==requests[1],'The identical accepted outfit/hair must have the same request, image source and placement'
  print(json.dumps({'width':width,'sameHairRequest':True,'continuousRounds':6,'originalUploadEveryRound':True,'sameResultPixelsAndFrame':True,'providerCalls':0}),flush=True)
 b.close()
