"""Real Easy compositor: legacy neck overlays cannot cover complete AI portraits."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('GOVERNMENT_INSIGNIA_BASE','http://127.0.0.1:5199')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [390,1440]:
  p=browser.new_page(viewport={'width':width,'height':1050},has_touch=width<600);errors=[]
  p.on('pageerror',lambda e:errors.append(str(e)));p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/government-result-insignia.html?fullbody=1&staleNeck=1')
  expect(p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='เครื่องหมาย',exact=True) if width<=720 else p.get_by_role('button',name='◈ ปิดเครื่องหมาย',exact=True)).to_be_enabled(timeout=30000)
  p.wait_for_function('insigniaFixture.snapshot()?.layers.some(l=>l.kind==="head")')
  assert p.evaluate('!insigniaFixture.snapshot().layers.some(l=>l.kind==="neck-fit")')
  assert p.evaluate('insigniaFixture.snapshot().layers.some(l=>l.kind==="head"&&l.portraitComposition==="en-outfit-body-v1")')
  pixels=p.evaluate('''()=>{const c=insigniaCanvas(),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let magenta=0;for(let i=0;i<data.length;i+=4)if(data[i]>230&&data[i+1]<30&&data[i+2]>230)magenta++;return magenta}''')
  assert pixels==0,'Legacy collar patch must not paint over the valid generated portrait'
  assert p.evaluate('insigniaFixture.aiCalls===0&&insigniaFixture.paymentCalls===0')
  assert not errors,errors
  print(json.dumps({'width':width,'staleNeckRemoved':True,'completePortraitRetained':True,'extraAiCalls':0}));p.close()
 browser.close()
