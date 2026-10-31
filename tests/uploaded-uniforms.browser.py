"""Uploaded uniforms through the real Studio catalog; shared history and touch colors.
Uses the app's actual catalog arrays and assets, without account/payment/AI requests.
"""
import json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/uploaded-uniforms-browser');OUT.mkdir(exist_ok=True)
source=(ROOT/'src/main.jsx').read_text()
arrays='\n'.join(re.search(r'const '+name+r'=\[[\s\S]*?\n\];',source).group(0)for name in ['JOB_UNIFORMS','STUDENT_UNIFORMS'])
expected={'female-navy-suit-6':'สูทหญิง แบบ 6','female-navy-suit-7':'สูทหญิง แบบ 7','male-navy-suit-5':'สูทชาย แบบ 5','student-female-rajamangala':'ราชมงคล','student-female-msu':'มมส','student-female-rajabhat':'ราชภัฏ'}
seed=arrays+'\nconst uploadedUniforms=[...JOB_UNIFORMS,...STUDENT_UNIFORMS].filter(t=>'+json.dumps(list(expected))+".includes(t.id)).map(t=>({...t,name:t.title,preview:t.img,group:t.cat==='job'?'สมัครงาน':'นักศึกษา'}));\n"
contrast='''([fg,bg])=>{const rgb=s=>s.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});const lum=s=>rgb(s).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}'''
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[];desktop_paths=None
 for width,height,touch in [(1440,1000,False),(320,740,True),(390,844,True),(820,1180,True),(1180,820,True)]:
  p=browser.new_page(viewport={'width':width,'height':height},has_touch=touch);p.set_default_timeout(12000)
  errors=[];api=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:api.append(r.url)if '/api/'in r.url else None)
  def fixture(r):
   response=r.fetch();body=response.text()
   for old,new in [('initialEasy: true,','initialEasy: false, purchaseSnapshotRef: (window.uniformSnapshot={current:null}),'),('templates: suits,','templates: uploadedUniforms,'),('freeTemplatePaths: [suit,','freeTemplatePaths: [...uploadedUniforms.map(t=>t.template),suit,')]:
    assert body.count(old)==1,old;body=body.replace(old,new,1)
   marker='createRoot(document.getElementById("root"))';assert marker in body
   r.fulfill(response=response,body=body.replace(marker,seed+marker,1))
  p.route('**/scripts/fixtures/easy-mode.jsx*',fixture)
  action=lambda locator:locator.tap()if touch else locator.click()
  try:
   p.goto(BASE+'/scripts/fixtures/easy-mode.html',wait_until='networkidle');p.add_style_tag(url=BASE+'/src/style.css');p.wait_for_load_state('networkidle')
   p.wait_for_function('!!window.uniformSnapshot?.current');expect(p.locator('.idstudio.studio-redesign')).to_be_visible()
   action(p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True))
   selected=[]
   for group in ['สมัครงาน','นักศึกษา']:
    action(p.get_by_role('tab',name=group,exact=True))
    for id,title in expected.items():
     if (group=='นักศึกษา')!=id.startswith('student-'):continue
     card=p.get_by_role('button',name='เลือกชุด '+title,exact=True);expect(card).to_be_visible()
     p.wait_for_function("title=>[...document.querySelectorAll('.studio-catalog-grid button')].find(b=>b.getAttribute('aria-label')==='เลือกชุด '+title)?.querySelector('img')?.naturalWidth>0",arg=title)
     action(card)
     p.wait_for_function("id=>window.uniformSnapshot.current().layers.find(l=>l.kind==='suit')?.assetId===id",arg=id)
     expect(p.locator('.studio-status')).to_contain_text('เลือก '+title+' แล้ว')
     if not touch:p.wait_for_function("document.querySelector('.studio-layers .studio-layer-thumbnail')?.naturalWidth>0")
     selected.append(id)
   controls=p.locator('.studio-touch-history'if touch else'.studio-design-history')
   paths=controls.locator('svg').evaluate_all("nodes=>nodes.map(svg=>[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')))")
   assert len(paths)==2
   if not touch:desktop_paths=paths
   else:
    assert paths==desktop_paths,'Mobile undo/redo differ from the desktop line icons'
    for button in controls.locator('button').all():
     box=button.bounding_box();assert box['width']>=40 and box['height']>=40
     assert box['x']>=0 and box['x']+box['width']<=width
     assert button.evaluate('e=>getComputedStyle(e).borderRadius')=='0px'
    menu=p.get_by_role('button',name='เปิดเครื่องมือ',exact=True)
    style=menu.evaluate("b=>({fg:getComputedStyle(b.querySelector('path')).stroke,bg:getComputedStyle(b).backgroundColor})")
    assert p.evaluate(contrast,[style['fg'],style['bg']])>=3,'The adjustment-menu icon is too faint'
    action(p.get_by_role('button',name='เลือกเลเยอร์',exact=True))
    action(p.locator('.studio-touch-layer-picker').get_by_role('button',name='ชุด',exact=True))
    panel=p.get_by_role('region',name='ปรับแต่งส่วนที่เลือก',exact=True);expect(panel).to_be_visible()
    active=panel.get_by_role('tab',name='ตำแหน่ง',exact=True)
    style=active.evaluate("b=>({fg:getComputedStyle(b).color,bg:getComputedStyle(b).backgroundColor})")
    assert p.evaluate(contrast,[style['fg'],style['bg']])>=4.5
    assert style['bg']=='rgb(112, 68, 237)'
    # Exercise the visible grouped history controls, preserving their real handlers.
    x=panel.get_by_role('slider',name='ปรับซ้าย–ขวา',exact=True);before=x.input_value()
    action(panel.get_by_role('button',name='เพิ่มซ้าย–ขวา',exact=True));expect(x).to_have_value(str(float(before)+1).removesuffix('.0'))
    action(controls.get_by_role('button',name='ย้อนกลับ',exact=True));expect(x).to_have_value(before)
    action(controls.get_by_role('button',name='ทำซ้ำ',exact=True));expect(x).to_have_value(str(float(before)+1).removesuffix('.0'))
   p.screenshot(path=str(OUT/f'uniforms-{width}x{height}.png'))
   assert not errors,errors;assert not api,api
   results.append({'viewport':[width,height],'touch':touch,'uploadedChoices':selected,'matchingHistoryIcons':True,'touchContrast':touch})
   print(json.dumps({'passedViewport':[width,height],'uniforms':len(selected)},ensure_ascii=False),flush=True)
  except Exception as e:
   p.screenshot(path=str(OUT/f'error-{width}x{height}.png'));print(json.dumps({'failedViewport':[width,height],'error':str(e),'pageErrors':errors},ensure_ascii=False),flush=True);raise
  finally:p.close()
 browser.close()
print(json.dumps({'passed':results,'apiCalls':0},ensure_ascii=False))
