"""Real Studio canvas: preserve face pixels and permit swaps during slow rights reads.
Local fixture only; no real account, generation, payment or download calls.
"""
import json,os,pathlib,time
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path(os.environ.get('SUIT_HANDOFF_OUTPUT','/tmp/suit-preview-handoff'));OUT.mkdir(parents=True,exist_ok=True)
FEMALE_IDS=['female-job-ivory-bow-blouse','female-job-light-pink-tweed-pearl-trim','female-job-navy-suit-gathered-cream-blouse','female-job-dusty-rose-tweed-pearl-buttons']
MALE_IDS=['male-job-black-suit-silver-gray-tie','male-job-slate-navy-suit-burgundy-tie','male-job-charcoal-gray-suit-burgundy-tie','male-job-midnight-black-suit-textured-silver-tie']
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang,width,male in [(lang,width,male)for lang in ['en','th']for width in [1440,390]for male in [False,True]]:
  IDS=MALE_IDS if male else FEMALE_IDS;suffix='.webp'if male else'.png'
  name=f'{lang}-{width}-'+('male'if male else'female');p=browser.new_page(viewport={'width':width,'height':1000 if width>600 else 844},has_touch=width<600);p.set_default_timeout(15000)
  errors=[];external=[];held=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  def route(r):
   if not r.request.url.startswith(BASE+'/') or '/api/' in r.request.url:external.append(r.request.url);r.abort()
   elif r.request.url.split('?')[0]==BASE+'/assets/job-uniforms/'+IDS[0]+suffix:held.append(r)
   else:r.continue_()
  p.route('**/*',route)
  def card(i):return p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="'+IDS[i]+'"]'))
  def selected():return p.evaluate("suitFixture.snapshot.current().layers.find(l=>l.kind==='suit').assetId||null")
  def gate(n):p.wait_for_function('n=>suitFixture.policyGates.length===n',arg=n)
  def settle(n,reject=False):p.evaluate('([n,reject])=>suitFixture.policyGates[n][reject?"reject":"resolve"](reject?Error("fixture late rights failure"):undefined)',[n,reject])
  try:
   p.goto(BASE+'/scripts/fixtures/suit-instant-preview.html?lang='+lang+'&detail=1'+('&male=1'if male else''),wait_until='domcontentloaded');p.wait_for_function('!!suitFixture.snapshot.current');p.wait_for_timeout(100)
   p.locator('.studio-bottom-choices').get_by_role('button',name='Outfit' if lang=='en' else 'ชุด',exact=True).click()
   for i in range(4):card(i).scroll_into_view_if_needed();card(i).locator('img').evaluate('async im=>{await im.decode()}')
   p.evaluate('''()=>{const c=document.querySelector('.studio-stage>canvas'),probe=Object.assign(document.createElement('canvas'),{width:72,height:96}),x=probe.getContext('2d',{willReadFrequently:true});
    const hash=d=>{let h=2166136261;for(const v of d)h=Math.imul(h^v,16777619);return h};
    window.headHash=()=>hash(c.getContext('2d').getImageData(Math.round(400*c.width/900),Math.round(250*c.height/1200),Math.round(100*c.width/900),Math.round(20*c.height/1200)).data);
    window.sceneHash=()=>{x.clearRect(0,0,72,96);x.drawImage(c,0,0,72,96);return hash(x.getImageData(0,0,72,96).data)};
    window.initialHeadHash=headHash();window.initialSceneHash=sceneHash();window.frames=[];window.recordFrames=true;
    const tick=()=>{if(!recordFrames)return;frames.push({head:headHash(),scene:sceneHash()});requestAnimationFrame(tick)};requestAnimationFrame(tick);suitFixture.holdPolicies=true}''')
   card(0).click();p.wait_for_function('sceneHash()!==initialSceneHash');p.wait_for_timeout(150)
   assert p.evaluate('headHash()===initialHeadHash'),'Changing a garment resampled the face'
   assert selected() is None,'Preview pixels were committed'
   assert held;held.pop().continue_();gate(1)
   expect(card(1)).to_be_enabled();assert card(1).evaluate('b=>getComputedStyle(b).opacity')=='1','Outfit choices dimmed during rights check'
   assert selected() is None,'An unapproved garment entered editor/history state'
   first_preview=p.evaluate('sceneHash()');p.evaluate('frames=[]')
   card(1).click();p.wait_for_function('h=>sceneHash()!==h',arg=first_preview);gate(2)
   second_preview=p.evaluate('sceneHash()');p.evaluate('frames=[]')
   settle(0);p.wait_for_timeout(150)
   assert selected() is None,'Late earlier rights response committed an old garment'
   assert p.evaluate('sceneHash()')==second_preview,'Late earlier choice changed the displayed garment'
   assert p.evaluate('frames.every(f=>f.head===initialHeadHash&&f.scene===sceneHash())'),'Portrait softened or old garment flashed during pending preview'
   p.evaluate('frames=[]');settle(1);p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId===id',arg=IDS[1]);p.wait_for_timeout(150)
   assert p.evaluate('frames.every(f=>f.scene!==initialSceneHash&&f.scene!=='+str(first_preview)+')'),'Previous garment flashed at full-PNG handoff'
   if lang=='en':assert p.evaluate('frames.every(f=>f.head===initialHeadHash)'),'Face pixels changed at preview/full PNG handoff'
   # Older failed permission checks must not roll back a newer successful choice.
   card(2).click();gate(3);card(3).click();gate(4);settle(3)
   p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId===id',arg=IDS[3]);settle(2,True);p.wait_for_timeout(100)
   assert selected()==IDS[3],'An obsolete policy failure rolled back the latest outfit'
   # A rejection for the current choice restores only its preview, never saves it.
   card(0).click();gate(5);settle(4,True)
   download=p.get_by_role('button',name='Download photo'if lang=='en'else'ดาวน์โหลดรูป',exact=True).filter(visible=True).first;expect(download).to_be_enabled()
   assert selected()==IDS[3]
   p.get_by_role('button',name='Back'if lang=='en'else'ย้อนกลับ',exact=True).filter(visible=True).first.click()
   p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId===id',arg=IDS[1])
   p.get_by_role('button',name='Redo'if lang=='en'else'ทำซ้ำ',exact=True).filter(visible=True).first.click()
   p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId===id',arg=IDS[3])
   assert p.evaluate('''async()=>{const s=suitFixture.snapshot.current().layers.find(l=>l.kind==='suit'),im=await createImageBitmap(await(await fetch(s.source)).blob());const ok=im.width===1504&&im.height>1200;im.close();return ok}''')
   assert p.evaluate('suitFixture.aiCalls')==0;assert not errors,errors;assert not external,external
   p.evaluate('recordFrames=false');p.screenshot(path=str(OUT/(name+'.png')))
   result={'case':name,'passed':True,'facePixelsUnchangedDuringPreview':True,'choicesEnabledDuringRightsCheck':True,'atomicNativeHandoff':True,'staleSuccessAndFailureIgnored':True,'unapprovedSourcesNeverCommitted':True,'undoRedoFullQualityOnly':True,'noAiPaymentOrDownloads':True}
   results.append(result);print(json.dumps(result),flush=True)
  except:
   p.screenshot(path=str(OUT/(name+'-failure.png')));raise
  finally:
   for r in held:r.abort()
   p.close()
 browser.close()
(OUT/'results.json').write_text(json.dumps(results,indent=2))
