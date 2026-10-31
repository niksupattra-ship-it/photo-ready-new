"""Real collar controls without duplicate previews, native compositor and history.
Only a local Studio fixture is used; no account, AI or payment operations.
"""
import hashlib,json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/collar-controls-browser');OUT.mkdir(exist_ok=True)
ROOT=pathlib.Path(__file__).resolve().parent.parent
tracked=['src/studio-editor.jsx','src/studio-collar-controls.jsx','src/collar-pin-controls.js']
hashes=lambda:{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest()for name in tracked}
before_sources=hashes();results=[]
SEED='''
const pinPart=(x,color)=>{const c=document.createElement('canvas');c.width=900;c.height=1200;const q=c.getContext('2d');q.fillStyle=color;q.fillRect(x,560,36,60);q.fillStyle='#fff';q.fillRect(x+12,570,12,10);return c.toDataURL()};
const pinLeft=pinPart(300,'#c68a20'),pinRight=pinPart(550,'#2460cf');
const pair=document.createElement('canvas');pair.width=900;pair.height=1200;
const loadPin=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src=src});
pair.getContext('2d').drawImage(await loadPin(pinLeft),0,0);pair.getContext('2d').drawImage(await loadPin(pinRight),0,0);
const shirt=document.createElement('canvas');shirt.width=900;shirt.height=1200;const shirtCtx=shirt.getContext('2d');shirtCtx.fillStyle='#f7f8fb';shirtCtx.fillRect(120,500,660,700);shirtCtx.strokeStyle='#d3d8e6';shirtCtx.lineWidth=4;shirtCtx.beginPath();shirtCtx.moveTo(220,500);shirtCtx.lineTo(370,680);shirtCtx.lineTo(450,600);shirtCtx.lineTo(530,680);shirtCtx.lineTo(680,500);shirtCtx.stroke();
const collarLayers=[{name:'พื้นหลัง',kind:'background',source:bg},{name:'ชุด',kind:'suit',source:shirt.toDataURL(),sourceFrame:{x:0,y:0,w:900,h:1200}},{name:'เข็มปกคอ',kind:'collar',source:pair.toDataURL(),sourceFrame:{x:0,y:0,w:900,h:1200},collarParts:{left:pinLeft,right:pinRight}}];
'''
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width,height in [(1440,1000),(1280,720),(390,844)]:
  p=browser.new_page(viewport={'width':width,'height':height},has_touch=width<1100)
  p.set_default_timeout(12000);errors=[];api=[]
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.on('request',lambda r:api.append(r.url)if '/api/'in r.url else None)
  def fixture(r):
   response=r.fetch();body=response.text();assert 'initialEasy: true,'in body
   body=body.replace('initialEasy: true,','initialEasy: false, purchaseSnapshotRef: (window.collarSnapshot={current:null}),',1)
   a=body.index('\tinitialLayers: [');b=body.index('\n\tplacement:',a)
   body=body[:a]+'initialLayers: collarLayers,'+body[b:]
   marker='createRoot(document.getElementById("root"))';assert marker in body
   body=body.replace(marker,SEED+'\n'+marker,1);r.fulfill(response=response,body=body)
  def readonly(r):
   response=r.fetch();body=response.text();marker='const easyUi =';assert marker in body
   body=body.replace(marker,'window.collarRead=()=>{const layer=state.current.find(l=>l.id===selectedRef.current),asset=assets.current.get(layer?.id);return {asset,pins:asset?.parts?pinBoxes(layer,asset).map(pin=>({side:pin.side,point:layerToScene(layer,{x:pin.box.x+pin.box.w/2,y:pin.box.y+pin.box.h/2})})):[]}};\n'+marker,1)
   r.fulfill(response=response,body=body)
  p.route('**/scripts/fixtures/easy-mode.jsx*',fixture)
  p.route('**/src/studio-editor.jsx*',readonly)
  try:
   p.goto(BASE+'/scripts/fixtures/easy-mode.html',wait_until='networkidle');p.add_style_tag(url=BASE+'/src/style.css');p.wait_for_load_state('networkidle')
   expect(p.locator('.idstudio.studio-redesign')).to_be_visible()
   p.wait_for_function("!!window.collarSnapshot?.current&&document.querySelector('.studio-stage canvas')")
   if width<1100:
    assert p.locator('.studio-collar-controls').count()==0;assert p.locator('.studio-touch').count()==1
    assert not errors,errors;results.append({'viewport':[width,height],'originalMobileLayout':True});p.close();continue
   p.get_by_role('button',name='เลเยอร์',exact=True).click()
   p.locator('.studio-layers').get_by_role('button',name='เข็มปกคอ',exact=True).click()
   p.get_by_role('button',name='คุณสมบัติ',exact=True).click()
   panel=p.locator('.studio-collar-controls');expect(panel).to_be_visible()
   expect(panel.get_by_role('button',name='ซ้าย',exact=True)).to_have_attribute('aria-pressed','true')
   assert p.locator('.studio-collar-sides').count()==0
   assert panel.locator('input[type=range]').count()==0
   assert panel.locator('canvas,img').count()==0
   assert p.locator('.collar-preview-wrap,.studio-collar-preview-dialog').count()==0
   assert not p.locator('.studio-design-layer-section').count()
   bottom=panel.get_by_role('button',name='คืนค่าเข็มซ้าย',exact=True).bounding_box()
   assert bottom['y']+bottom['height']<=height,'Collar controls do not fit the desktop height'
   data=lambda:p.evaluate("()=>{const l=window.collarSnapshot.current().layers.find(l=>l.kind==='collar');return Object.fromEntries(Object.entries(l).filter(([k])=>['x','y','scale','rotation'].includes(k)||/^collar(Left|Right)[XYSR]/.test(k)))}")
   pixel_hash=lambda:p.evaluate("""async()=>{const a=window.collarRead().asset,c=a.original;const f=a.sourceFrame||{x:0,y:0,w:900,h:1200};const q=c.getContext('2d').getImageData(Math.round((525-f.x)/f.w*c.width),Math.round((535-f.y)/f.h*c.height),Math.round(110/f.w*c.width),Math.round(115/f.h*c.height));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',q.data))].join(',')}""")
   original_right=pixel_hash();initial=p.evaluate('JSON.stringify(window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarParts)')
   panel.get_by_role('button',name='ขวา เข็มซ้าย',exact=True).click()
   expect(panel.get_by_role('spinbutton',name='เข็มซ้าย X',exact=True)).to_have_value('1')
   panel.get_by_role('button',name='5 px',exact=True).click()
   panel.get_by_role('button',name='ขึ้น เข็มซ้าย',exact=True).click()
   expect(panel.get_by_role('spinbutton',name='เข็มซ้าย Y',exact=True)).to_have_value('-5')
   size=panel.get_by_role('spinbutton',name='เข็มซ้าย ขนาด',exact=True);size.fill('120')
   panel.get_by_role('button',name='เพิ่ม เข็มซ้าย ขนาด',exact=True).click()
   expect(size).to_have_value('121')
   angle=panel.get_by_role('spinbutton',name='เข็มซ้าย หมุน',exact=True);angle.fill('15');angle.press('Enter');expect(angle).to_have_value('15')
   assert pixel_hash()==original_right,'Editing the left pin changed native right-pin pixels'
   assert data().get('collarRightScale',1)==1 and data().get('collarRightRotation',0)==0 and data()['rotation']==0
   # Canvas rotation handles follow the selected pin, rather than the whole pair.
   p.get_by_role('button',name='หมุนเลเยอร์',exact=True).focus();p.keyboard.press('ArrowRight')
   expect(angle).to_have_value('16');assert data()['rotation']==0;assert pixel_hash()==original_right
   grip=p.get_by_role('button',name='ปรับขนาดมุม 3',exact=True).bounding_box();gx=grip['x']+grip['width']/2;gy=grip['y']+grip['height']/2
   p.mouse.move(gx,gy);p.mouse.down();p.mouse.move(gx+10,gy+10,steps=6);p.mouse.up()
   p.wait_for_function('window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarLeftScale>1.21')
   assert data()['scale']==1 and data().get('collarRightScale',1)==1;assert pixel_hash()==original_right
   p.get_by_role('button',name='ย้อนกลับ',exact=True).click();expect(size).to_have_value('121');expect(angle).to_have_value('16')
   panel.get_by_role('button',name='ขวา',exact=True).click()
   x=panel.get_by_role('spinbutton',name='เข็มขวา X',exact=True);x.fill('12');x.press('Enter');expect(x).to_have_value('12')
   assert data()['collarLeftX']==1 and data()['collarLeftRotation']==16
   # Pair spacing is symmetric, keeping its midpoint and vertical positions.
   gap=panel.get_by_role('spinbutton',name='ระยะห่างเข็มทั้งคู่',exact=True);gap.fill('21');gap.press('Enter')
   p.wait_for_function('window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarRightX===17')
   assert data()['collarLeftX']==-4 and data()['collarLeftY']==-5 and data().get('collarRightY',0)==0
   panel.get_by_role('button',name='ซ้าย',exact=True).click();panel.get_by_role('button',name='คืนค่าเข็มซ้าย',exact=True).click()
   expect(size).to_have_value('100');expect(angle).to_have_value('0');assert data()['collarRightX']==17
   # Direct canvas dragging remains available after removing the sidebar preview.
   pin=p.evaluate("window.collarRead().pins.find(pin=>pin.side==='left').point")
   rect=p.locator('.studio-stage > canvas').bounding_box()
   px=rect['x']+pin['x']/900*rect['width'];py=rect['y']+pin['y']/1200*rect['height']
   before=data();p.mouse.move(px,py);p.mouse.down();p.mouse.move(px+12,py+5,steps=6);p.mouse.up()
   p.wait_for_function('Math.abs(window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarLeftX)>1')
   moved=data();assert moved['collarRightX']==17 and moved['x']==before['x'] and moved['rotation']==before['rotation']
   p.get_by_role('button',name='ย้อนกลับ',exact=True).click();p.wait_for_function('window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarLeftX===0')
   p.get_by_role('button',name='ทำซ้ำ',exact=True).click();p.wait_for_function('Math.abs(window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarLeftX)>1')
   assert initial==p.evaluate('JSON.stringify(window.collarSnapshot.current().layers.find(l=>l.kind==="collar").collarParts)'),'Original part images were mutated'
   panel.get_by_role('button',name='ทั้งคู่',exact=True).click();old=data()['x'];panel.get_by_role('button',name='ขวา เข็มทั้งคู่',exact=True).click();expect(panel.get_by_role('spinbutton',name='เข็มทั้งคู่ X',exact=True)).to_have_value(str(old+5).removesuffix('.0'))
   # The neighboring tools keep their ordinary property controls.
   p.get_by_role('button',name='เลเยอร์',exact=True).click();p.locator('.studio-layers').get_by_role('button',name='ชุด',exact=True).click();p.get_by_role('button',name='คุณสมบัติ',exact=True).click()
   assert p.locator('.studio-collar-controls').count()==0;expect(p.get_by_role('slider',name='ความทึบ',exact=True)).to_be_visible()
   p.get_by_role('button',name='เลเยอร์',exact=True).click();p.locator('.studio-layers').get_by_role('button',name='เข็มปกคอ',exact=True).click();p.get_by_role('button',name='คุณสมบัติ',exact=True).click()
   p.screenshot(path=str(OUT/('collar-'+str(width)+'.png')))
   assert not errors,errors;assert not api,api
   results.append({'viewport':[width,height],'singlePinPositionScaleRotation':True,'oppositeNativePixelsUnchanged':True,'spacingSymmetric':True,'canvasDrag':True,'history':True,'nativePartsUnchanged':True,'sidebarPreviewRemoved':True,'otherToolsUnchanged':True})
  except Exception as error:
   try:p.screenshot(path=str(OUT/('error-'+str(width)+'.png')))
   except Exception:pass
   print(json.dumps({'failedViewport':[width,height],'error':str(error),'pageErrors':errors},ensure_ascii=False),flush=True);raise
  finally:
   if not p.is_closed():p.close()
 browser.close()
assert hashes()==before_sources
print(json.dumps({'passed':results,'apiCalls':0},ensure_ascii=False))
