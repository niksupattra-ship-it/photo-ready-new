"""Real gown assets and search UI, with local fixture layers and no account/AI calls."""
import pathlib,re
from playwright.sync_api import sync_playwright,expect

root=pathlib.Path(__file__).resolve().parent.parent
source=(root/'src/main.jsx').read_text()
catalog=re.search(r'const GOWN_UNIFORMS=\[[\s\S]*?\n\];',source).group(0)
seed=catalog+"\nconst gownOptions=GOWN_UNIFORMS.map(t=>({...t,name:t.title,preview:t.img,group:'ชุดครุย'}));\n"
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,touch in [(1440,False),(390,True)]:
  page=browser.new_page(viewport={'width':width,'height':1000},has_touch=touch)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def fixture(route):
   response=route.fetch();body=response.text()
   for old,new in [('initialEasy: true,','initialEasy: false, purchaseSnapshotRef: (window.gownSnapshot={current:null}),'),('templates: suits,','templates: gownOptions,'),('freeTemplatePaths: [suit,','freeTemplatePaths: [...gownOptions.map(t=>t.template),suit,')]:
    assert body.count(old)==1,old
    body=body.replace(old,new,1)
   marker='createRoot(document.getElementById("root"))'
   route.fulfill(response=response,body=body.replace(marker,seed+marker,1))
  page.route('**/scripts/fixtures/easy-mode.jsx*',fixture)
  page.goto('http://127.0.0.1:5173/scripts/fixtures/easy-mode.html',wait_until='networkidle')
  page.add_style_tag(url='http://127.0.0.1:5173/src/style.css')
  page.wait_for_function('!!window.gownSnapshot?.current')
  click=lambda locator:locator.tap() if touch else locator.click()
  click(page.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True))
  click(page.get_by_role('tab',name='ชุดครุย',exact=True))
  search=page.get_by_role('searchbox',name='ค้นหาชุด',exact=True)
  expect(search).to_be_visible()
  expect(page.locator('.studio-catalog-grid button[aria-label^="เลือกชุด "]')).to_have_count(7)
  for query,count in [('ขอนแก่น',2),('เนติบัณฑิต',2),('สจล.',2),('มสธ.',1),('ไม่มีชื่อนี้',0),('   ',7)]:
   search.fill(query)
   expect(page.locator('.studio-catalog-grid button[aria-label^="เลือกชุด "]')).to_have_count(count)
  search.fill('ขอนแก่นชาย')
  card=page.get_by_role('button',name='เลือกชุด ขอนแก่นชาย',exact=True)
  click(card)
  page.wait_for_function("window.gownSnapshot.current().layers.some(l=>l.assetId==='khon-kaen-male')")
  search.fill('มสธ.')
  click(page.get_by_role('button',name='เลือกชุด มสธ.ปฏิบัติงาน',exact=True))
  page.wait_for_function("window.gownSnapshot.current().layers.some(l=>l.assetId==='stou-operational')")
  box=search.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
  assert not errors,errors
  page.screenshot(path=f'/tmp/gown-catalog-{width}.png')
  print(f'PASS {width}px: all 7 gowns, Thai name search, empty/clear search and actual suit selection')
  page.close()
 for gender in ['female','male']:
  page=browser.new_page(viewport={'width':1440,'height':1000})
  def easy_fixture(route):
   response=route.fetch();body=response.text();marker='createRoot(document.getElementById("root"))'
   body=body[:body.index(marker)]+seed+'\nimport {EasyMode} from "/src/easy-mode.jsx";\n'+"createRoot(document.getElementById('root')).render(React.createElement(EasyMode,{gender:"+repr(gender)+",templates:gownOptions,canvasRef:{current:null},hasResult:true,ready:true,hairs:[],backgrounds:[],onSuit:t=>window.selectedGown=t.id}));"
   route.fulfill(response=response,body=body)
  page.route('**/scripts/fixtures/easy-mode.jsx*',easy_fixture)
  page.goto('http://127.0.0.1:5173/scripts/fixtures/easy-mode.html',wait_until='networkidle')
  page.get_by_role('button',name='ชุด',exact=True).click()
  page.get_by_role('button',name='ชุดครุย',exact=True).click()
  expect(page.locator('.easy-suit-grid button')).to_have_count(7)
  search=page.get_by_role('searchbox',name='ค้นหาชุด',exact=True)
  search.fill('ขอนแก่น');expect(page.locator('.easy-suit-grid button')).to_have_count(2)
  page.locator('.easy-suit-grid button').filter(has_text='ขอนแก่นชาย').click()
  page.wait_for_function("window.selectedGown==='khon-kaen-male'")
  search.fill('ไม่มีชื่อนี้');expect(page.get_by_text('ไม่พบชุดที่ตรงกับคำค้น',exact=True)).to_be_visible()
  search.fill('');expect(page.locator('.easy-suit-grid button')).to_have_count(7)
  print(f'PASS Easy Mode {gender}: shared gowns, search and selection')
  page.close()
 browser.close()
