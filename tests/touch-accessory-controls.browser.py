"""Touch catalog selection must open usable controls for all three accessories.
Runs the actual editor and native asset preparation, without account/AI/payment calls.
"""
import json,os,pathlib,re
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/touch-accessory-controls');OUT.mkdir(exist_ok=True)
SEED='''
const icon=(w,h,color)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,w,h);return c.toDataURL()};
const collarChoices=[{id:'collar-test',name:'เข็มปกคอทดสอบ',left:icon(40,60,'#c68a20'),right:icon(40,60,'#2460cf')}];
const chestChoices=[{id:'chest-test',name:'เข็มติดอกทดสอบ',src:icon(90,45,'#c68a20')}];
const ribbonChoices=[{id:'ribbon-test',name:'แพรแถบทดสอบ',src:icon(120,45,'#c62850')}];
const shirt=document.createElement('canvas');shirt.width=900;shirt.height=1200;const q=shirt.getContext('2d');q.fillStyle='#f7f8fb';q.fillRect(120,500,660,700);
const accessoryLayers=[{name:'พื้นหลัง',kind:'background',source:bg},{name:'ชุด',kind:'suit',source:shirt.toDataURL(),sourceFrame:{x:0,y:0,w:900,h:1200}}];
'''
KINDS=[('collar','เข็มปกคอ'),('chest','เข็มติดอก'),('ribbon','แพรแถบ')]
with sync_playwright()as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for width,height in json.loads(os.environ.get('TOUCH_ACCESSORY_VIEWPORTS','[[390,844],[844,390],[820,1180],[1180,820],[1366,1024]]')):
  p=browser.new_page(viewport={'width':width,'height':height},has_touch=True);p.set_default_timeout(12000)
  errors=[];api=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:api.append(r.url)if '/api/'in r.url else None)
  def fixture(r):
   response=r.fetch();body=response.text()
   assert 'initialEasy: true,'in body
   body=body.replace('initialEasy: true,','initialEasy: false, purchaseSnapshotRef: (window.accessorySnapshot={current:null}),',1)
   a=body.index('\tinitialLayers: [');b=body.index('\n\tplacement:',a);body=body[:a]+'initialLayers: accessoryLayers,'+body[b:]
   for name,value in [('collarPins','collarChoices'),('chestPins','chestChoices'),('ribbons','ribbonChoices')]:
    body,n=re.subn(r'\b'+name+r': (?:empty|\[[\s\S]*?\]),',name+': '+value+',',body,count=1);assert n==1,name
   marker='createRoot(document.getElementById("root"))';assert marker in body
   r.fulfill(response=response,body=body.replace(marker,SEED+'\n'+marker,1))
  def readonly(r):
   response=r.fetch();body=response.text();marker='const easyUi =';assert marker in body
   code="window.accessoryRead=()=>{const l=state.current.find(l=>l.id===selectedRef.current),a=assets.current.get(l?.id);return l?{selected:l.id,undoCount:undo.current.length,point:a?.parts?layerToScene(l,(()=>{const b=pinBoxes(l,a)[0].box;return {x:b.x+b.w/2,y:b.y+b.h/2}})()):layerCenter(l)}:null};\n"
   r.fulfill(response=response,body=body.replace(marker,code+marker,1))
  p.route('**/scripts/fixtures/easy-mode.jsx*',fixture);p.route('**/src/studio-editor.jsx*',readonly)
  layers=lambda:p.evaluate('window.accessorySnapshot.current().layers.map(({id,kind,x,y,scale,rotation,squeezeX,squeezeY,opacity,collarLeftX,collarRightX})=>({id,kind,x,y,scale,rotation,squeezeX,squeezeY,opacity,collarLeftX,collarRightX}))')
  try:
   p.goto(BASE+'/scripts/fixtures/easy-mode.html',wait_until='networkidle');p.add_style_tag(url=BASE+'/src/style.css');p.wait_for_load_state('networkidle')
   expect(p.locator('.idstudio.studio-touch')).to_be_visible();p.wait_for_function('!!window.accessorySnapshot?.current')
   checked=[]
   for kind,label in KINDS:
    before=layers()
    p.locator('.studio-bottom-choices').get_by_role('button',name=label,exact=True).tap()
    expect(p.locator('.studio-picker-drawer')).to_be_visible()
    p.get_by_role('button',name='เลือก'+label+' '+label+'ทดสอบ',exact=True).tap()
    panel=p.get_by_role('region',name='ปรับแต่งส่วนที่เลือก',exact=True)
    expect(panel).to_be_visible();expect(p.locator('.studio-picker-drawer')).to_have_count(0)
    expect(panel.get_by_role('tab',name='ตำแหน่ง',exact=True)).to_have_attribute('aria-selected','true')
    target=next(l for l in layers()if l['kind']==kind)
    assert p.evaluate('window.accessoryRead().selected')==target['id']
    box=panel.bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height
    # Verify real selected-layer changes through the visible touch controls.
    panel.get_by_role('button',name='เพิ่มซ้าย–ขวา',exact=True).tap()
    expect(panel.get_by_role('slider',name='ปรับซ้าย–ขวา',exact=True)).to_have_value('1')
    panel.get_by_role('button',name='เพิ่มขึ้น–ลง',exact=True).tap()
    expect(panel.get_by_role('slider',name='ปรับขึ้น–ลง',exact=True)).to_have_value('1')
    positioned=next(l for l in layers()if l['id']==target['id']);assert (positioned['x'],positioned['y'])==(1,1)
    panel.get_by_role('tab',name='ขนาด',exact=True).tap();panel.get_by_role('button',name='เพิ่มขนาด',exact=True).tap()
    expect(panel.get_by_role('slider',name='ปรับขนาด',exact=True)).to_have_value('1.01')
    panel.get_by_role('tab',name='หมุน',exact=True).tap();panel.get_by_role('button',name='เพิ่มหมุน',exact=True).tap()
    expect(panel.get_by_role('slider',name='ปรับหมุน',exact=True)).to_have_value('1')
    panel.get_by_role('tab',name='ความทึบ',exact=True).tap();panel.get_by_role('button',name='ลดความทึบ',exact=True).tap()
    expect(panel.get_by_role('slider',name='ปรับความทึบ',exact=True)).to_have_value('0.99')
    after=layers();edited=next(l for l in after if l['id']==target['id'])
    assert (edited['scale'],edited['rotation'],edited['opacity'])==(1.01,1,.99),edited
    assert [l for l in after if l['id']!=target['id']]==before,'Editing one accessory changed another layer'
    # A canvas tap and a layer-picker selection must also reopen the adjustment box.
    panel.get_by_role('button',name='ย่อแผงปรับแต่ง',exact=True).tap();expect(panel).to_have_count(0)
    before_tap=layers();undo_before=p.evaluate('window.accessoryRead().undoCount')
    point=p.evaluate('window.accessoryRead().point');rect=p.locator('.studio-stage > canvas').bounding_box()
    p.touchscreen.tap(rect['x']+point['x']/900*rect['width'],rect['y']+point['y']/1200*rect['height'])
    expect(panel).to_be_visible();assert p.evaluate('window.accessoryRead().selected')==target['id']
    assert layers()==before_tap,'A simple tap on a tiny accessory changed its transform'
    assert p.evaluate('window.accessoryRead().undoCount')==undo_before,'A tap added an empty history entry'
    p.get_by_role('button',name='เลือกเลเยอร์',exact=True).tap()
    p.locator('.studio-touch-layer-picker').get_by_role('button',name=label,exact=True).tap();expect(panel).to_be_visible()
    # Replacing the same catalog choice opens position controls again, even from another tab.
    panel.get_by_role('tab',name='หมุน',exact=True).tap()
    p.locator('.studio-bottom-choices').get_by_role('button',name=label,exact=True).tap()
    p.get_by_role('button',name='เลือก'+label+' '+label+'ทดสอบ',exact=True).tap();expect(panel).to_be_visible()
    expect(panel.get_by_role('tab',name='ตำแหน่ง',exact=True)).to_have_attribute('aria-selected','true')
    # Dragging a handle still resizes, and one undo restores the complete edit.
    panel.get_by_role('button',name='ย่อแผงปรับแต่ง',exact=True).tap();expect(panel).to_have_count(0)
    before_drag=layers();undo_before=p.evaluate('window.accessoryRead().undoCount')
    grip=p.get_by_role('button',name='ปรับขนาดมุม 3',exact=True).bounding_box();gx=grip['x']+grip['width']/2;gy=grip['y']+grip['height']/2
    # Use the mouse on the active touch layout for deterministic handle dragging.
    # Native catalog/canvas taps above still use actual emulated touchscreen input.
    p.mouse.move(gx,gy);p.mouse.down();p.mouse.move(gx+15,gy+15,steps=6);p.mouse.up()
    p.wait_for_function("before=>{const l=window.accessorySnapshot.current().layers.find(l=>l.id===before.id);return ['x','y','scale','rotation','squeezeX','squeezeY'].some(k=>(l[k]??null)!==before[k])}",arg=next(l for l in before_drag if l['id']==target['id']))
    assert p.evaluate('window.accessoryRead().undoCount')==min(15,undo_before+1),{'kind':kind,'historyBefore':undo_before}
    p.get_by_role('button',name='ย้อนกลับ',exact=True).tap()
    p.wait_for_function("before=>{const l=window.accessorySnapshot.current().layers.find(l=>l.id===before.id);return Object.entries(before).every(([k,v])=>(l[k]??null)===v)}",arg=next(l for l in before_drag if l['id']==target['id']))
    assert layers()==before_drag,{'message':'Undo did not restore the touch handle resize','before':before_drag,'after':layers()}
    # Leave the final screenshot on the usable adjustment box.
    p.get_by_role('button',name='เลือกเลเยอร์',exact=True).tap()
    p.locator('.studio-touch-layer-picker').get_by_role('button',name=label,exact=True).tap();expect(panel).to_be_visible()
    checked.append(kind)
   p.screenshot(path=str(OUT/f'accessories-{width}x{height}.png'))
   # A native two-finger gesture starting on a pending handle tap must keep undo.
   # Run after ordinary taps: Chromium CDP native drag sessions suppress their
   # next compatibility click when mixed with Playwright's separate tap session.
   panel.get_by_role('button',name='ย่อแผงปรับแต่ง',exact=True).tap()
   grip=p.get_by_role('button',name='ปรับขนาดมุม 3',exact=True).bounding_box();gx=grip['x']+grip['width']/2;gy=grip['y']+grip['height']/2
   undo_before=p.evaluate('window.accessoryRead().undoCount');before_pinch=layers()
   cdp=p.context.new_cdp_session(p);first={'id':1,'x':gx,'y':gy};second={'id':2,'x':gx+45,'y':gy-25}
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[first,second]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
   assert p.evaluate('window.accessoryRead().undoCount')==undo_before
   assert layers()==before_pinch

   assert not errors,errors;assert not api,api
   results.append({'viewport':[width,height],'touch':True,'catalogCanvasAndLayers':checked,'positionSizeRotationOpacity':True,'otherLayersUnchanged':True,'tapWithoutEdits':True,'touchLayoutHandleResizeAndUndo':True,'pinchKeepsHistory':True})
   print(json.dumps({'passedViewport':[width,height],'accessories':checked},ensure_ascii=False),flush=True)
  except Exception as e:
   p.screenshot(path=str(OUT/f'error-{width}x{height}.png'));print(json.dumps({'failedViewport':[width,height],'error':str(e),'pageErrors':errors},ensure_ascii=False),flush=True);raise
  finally:p.close()
 browser.close()
print(json.dumps({'passed':results,'apiCalls':0},ensure_ascii=False))
