"""Thai Easy package eligibility on real editor layers; all service callbacks are inert."""
import json,os,pathlib
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('THAI_SUITS_BASE','http://127.0.0.1:5201')
OUTPUT=pathlib.Path(os.environ.get('EASY_SUIT_LOCK_OUTPUT','/tmp/easy-suit-lock-browser'))
OUTPUT.mkdir(parents=True,exist_ok=True)

def scene_stamp(page):
 return page.evaluate('''async()=>{
  const layers=insigniaFixture.snapshot().layers;
  const bytes=new TextEncoder().encode(JSON.stringify(layers.map(l=>({id:l.id,kind:l.kind,source:l.source,sourceFrame:l.sourceFrame,x:l.x,y:l.y,scale:l.scale,rotation:l.rotation,templatePath:l.templatePath,assetId:l.assetId}))));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 }''')

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 cases=[(width,gender,pro,False) for width in [390,1440] for gender in ['female','male'] for pro in [False,True]]
 cases += [(390,gender,False,True) for gender in ['female','male']]
 for width,gender,pro,retained in cases:
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=width<600)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.route('**/api/**',lambda route:route.abort())
  female=gender=='female';fixture='femaleSuits' if female else 'maleSuits'
  page.goto(f'{BASE}/scripts/fixtures/government-result-insignia.html?{fixture}=1&gender={gender}&fresh=1&pro={int(pro)}&workPro={int(retained)}')
  page.get_by_role('button',name='หญิง' if female else 'ชาย',exact=True).click()
  hair=page.get_by_role('button',name='ฟรีผมหญิง' if female else 'ฟรีผมชาย',exact=True)
  expect(hair).to_be_enabled(timeout=30000);hair.click()
  panel=page.get_by_role('region',name='เลือกชุด',exact=True)
  more=panel.get_by_role('button',name='ดูชุดเพิ่มเติม (5)',exact=True)
  expect(more).to_be_enabled(timeout=30000);more.click()
  for index in range(1,5):
   expect(panel.get_by_role('button',name=('ฟรี ' if female else 'ฟรีชาย ')+str(index),exact=True)).to_be_enabled()
  # Choosing an eligible outfit commits its actual native source to the scene.
  free=panel.get_by_role('button',name='ฟรี 4' if female else 'ฟรีชาย 4',exact=True);free.click()
  expected='/assets/job-uniforms/female-job-ivory-bow-blouse.png' if female else '/assets/job-uniforms/male-job-navy-burgundy-shirt.webp'
  page.wait_for_function('(path)=>insigniaLayers().some(l=>l.kind==="suit"&&l.templatePath===path)',arg=expected)
  expect(free).to_be_enabled(timeout=30000)
  paid=panel.get_by_role('button',name='ชุดโปร' if female else 'ชุดโปรชาย',exact=True)
  expect(paid).to_be_visible()
  expect(panel.get_by_label('สมัครโปรเพื่อปลดล็อกชุด')).to_have_count(0)
  assert '◆' not in paid.inner_text(),'Unavailable suits are dimmed, with no Diamond icon'
  if pro or retained:
   expect(paid).to_be_enabled(timeout=30000)
   assert float(paid.evaluate('(button)=>getComputedStyle(button).opacity'))>=.9
   paid.click()
   premium='/assets/job-uniforms/female-job-taupe-cream-blouse.png' if female else '/assets/job-uniforms/male-job-charcoal-burgundy-tie.png'
   page.wait_for_function('(path)=>insigniaLayers().some(l=>l.kind==="suit"&&l.templatePath===path)',arg=premium)
   expect(paid).to_have_attribute('aria-pressed','true')
  else:
   expect(paid).to_be_disabled()
   assert float(paid.evaluate('(button)=>getComputedStyle(button).opacity'))<.8,'Unavailable suits must visibly dim'
   before=scene_stamp(page)
   paid.evaluate('(button)=>button.click()');paid.dispatch_event('click')
   assert scene_stamp(page)==before,'Blocked clicks must not change original pixels, outfit or geometry'
   expect(paid).to_have_attribute('aria-pressed','false')
   expect(free).to_have_attribute('aria-pressed','true')
   page.screenshot(path=str(OUTPUT/f'{gender}-{width}-unavailable.png'),full_page=True)
  assert page.evaluate('insigniaFixture.aiCalls')==0
  assert page.evaluate('insigniaFixture.paymentCalls')==0
  assert not errors,errors
  print(json.dumps({'width':width,'gender':gender,'pro':pro,'retainedCurrentWork':retained,'freeFour':True,'paidSelectable':pro or retained,'nativeSceneProtected':True,'noAiOrCheckout':True}),flush=True)
  page.close()
 browser.close()
 print(json.dumps({'cases':len(cases),'screenshots':str(OUTPUT)}),flush=True)
