"""Real Thai result layers and pointer gestures; no provider, wallet or payment writes."""
import json,math,os,pathlib
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('GOVERNMENT_INSIGNIA_BASE','http://127.0.0.1:5198')
OUTPUT=pathlib.Path(os.environ.get('GOVERNMENT_INSIGNIA_OUTPUT','/tmp/government-insignia-browser'))
OUTPUT.mkdir(parents=True,exist_ok=True)

def layers(page):
 return page.evaluate('insigniaLayers()')
def selected(page,kind):
 return next((l for l in layers(page) if l['kind']==kind),None)
def wait_asset(page,kind,asset):
 page.wait_for_function('([kind,id])=>insigniaLayers().some(l=>l.kind===kind&&l.assetId===id)',arg=[kind,asset])
 page.wait_for_timeout(160)
def pick(page,tab,label,kind,asset):
 panel=page.locator('.thai-mobile-result-insignia-panel')
 panel.get_by_role('button',name=tab,exact=True).click()
 panel.get_by_role('button',name=label,exact=True).click()
 wait_asset(page,kind,asset)
def handle_box(page,identifier):
 node=page.locator(f'.thai-result-insignia-handle[data-kind="{identifier}"]')
 expect(node).to_have_count(1)
 return node.bounding_box()
def drag(page,identifier,dx,dy,touch=False):
 box=handle_box(page,identifier)
 area=page.locator('.thai-result-insignia-interaction').bounding_box()
 start={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
 end={'x':start['x']+dx/900*area['width'],'y':start['y']+dy/1200*area['height']}
 if touch:
  session=page.context.new_cdp_session(page)
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{**start,'id':1}]})
  for index in range(1,7):
   session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':start['x']+(end['x']-start['x'])*index/6,'y':start['y']+(end['y']-start['y'])*index/6,'id':1}]})
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
 else:
  page.mouse.move(**start);page.mouse.down();page.mouse.move(**end,steps=6);page.mouse.up()
 page.wait_for_timeout(160)
def resize(page,identifier):
 box=handle_box(page,identifier)
 # Select first, then drag the outside part of its SE grip. A touch inside
 # the real badge body intentionally starts a move, even when grips overlap.
 page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
 grip=page.locator(f'[data-kind="{identifier}"] [data-insignia-resize="se"]')
 expect(grip).to_be_visible();r=grip.bounding_box()
 x=r['x']+r['width']/2+8;y=r['y']+r['height']/2+8
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+14,y+14,steps=5);page.mouse.up();page.wait_for_timeout(160)

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 cases=0
 for width in [1440,390]:
  for gender,composition in [('female','wide'),('female','narrow'),('male','wide'),('male','narrow'),('female','photo-wide'),('female','photo-narrow')]:
   context=browser.new_context(viewport={'width':width,'height':1050},has_touch=width<600)
   page=context.new_page();errors=[];api=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('**/api/**',lambda r:(api.append(r.request.url),r.abort()))
   fullbody=composition.startswith('photo-')
   page.goto(f'{BASE}/scripts/fixtures/government-result-insignia.html?gender={gender}&composition={composition.removeprefix("photo-")}&fullbody={int(fullbody)}')
   launch=page.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='เครื่องหมาย',exact=True) if width<=720 else page.get_by_role('button',name='◈ ปิดเครื่องหมาย',exact=True)
   expect(launch).to_be_enabled(timeout=30000);launch.click() if width<=720 else None
   pick(page,'ปกคอ','มท.','collar','garuda-pair')
   expect(page.locator('.thai-result-insignia-handle[data-kind^="collar-"]')).to_have_count(2)
   original=selected(page,'collar')
   assert original['hasCollarParts'] and original['scale']==1
   assert original.get('squeezeX',1)==1 and original.get('squeezeY',1)==1
   for identifier in ['collar-left','collar-right']:
    box=handle_box(page,identifier);assert box['width']>3 and box['height']>3

   # A real canvas diff proves that choosing each badge changes output
   # pixels as well as creating HTML handles / state metadata.
   page.evaluate('captureInsigniaPixels()')
   pick(page,'เข็มติดอก','อบจ.','chest','pao')
   diff=page.evaluate('insigniaPixelDifference()')
   assert diff['count']>30,'Chest must be painted, not just selected in a menu'
   before_ribbon=page.evaluate('captureInsigniaPixels()')
   pick(page,'แพรแถบ','2504-2514','ribbon','2504-2514')
   diff=page.evaluate('insigniaPixelDifference()')
   assert diff['count']>100,'Ribbon must be painted into the real result canvas'
   frame=page.locator('.thai-result-insignia-interaction').bounding_box()
   ribbon_box=handle_box(page,'ribbon')
   scene={k:(ribbon_box[k]-frame[k])/frame['width' if k=='x' else 'height']*(900 if k=='x' else 1200) for k in ['x','y']}
   scene['w']=ribbon_box['width']/frame['width']*900;scene['h']=ribbon_box['height']/frame['height']*1200
   for axis in ['x','y','w','h']:
    assert abs(scene[axis]-diff['box'][axis])<5,('Actual painted ribbon and handle must agree',axis,scene,diff)
   for kind in ['chest','ribbon']:
    alpha=page.evaluate('(kind)=>insigniaAlpha(kind)',kind)
    assert alpha['pixels']>50
    f=alpha['frame']
    assert abs(f['w']/f['h']-alpha['width']/alpha['height'])<.001,'Native PNG aspect ratio must be retained'
    assert alpha.get('squeezeX',1)==1 and alpha.get('squeezeY',1)==1

   if gender=='female':
    # Reference 2: assert the FIRST selection before any move or resize.
    # These are bounds on the painted original garment, not just state flags.
    garment=page.evaluate('insigniaFixture.frame')
    overlay=page.locator('.thai-result-insignia-interaction').bounding_box()
    for identifier,x in [('collar-left',.316),('collar-right',.680)]:
     box=handle_box(page,identifier)
     center_x=(box['x']+box['width']/2-overlay['x'])/overlay['width']*900
     center_y=(box['y']+box['height']/2-overlay['y'])/overlay['height']*1200
     assert abs(center_x-(garment['x']+garment['w']*x))<(8 if fullbody else 3)
     assert abs(center_y-(garment['y']+garment['h']*.285))<(10 if fullbody else 3)
     assert abs(box['width']/overlay['width']*900-garment['w']*.054)<3
    for kind,x,y,w in [('chest',.230,.525,.067),('ribbon',.764,.491,.204)]:
     f=selected(page,kind)['sourceFrame']
     assert abs(f['x']+f['w']/2-(garment['x']+garment['w']*x))<(8 if fullbody else 1)
     assert abs(f['y']+(f['h']/2 if kind=='chest' else 0)-(garment['y']+garment['h']*y))<(10 if fullbody else 1)
     assert abs(f['w']-garment['w']*w)<(4 if fullbody else 1)

   page.screenshot(path=str(OUTPUT/f'{gender}-{composition}-{width}-placed.png'),full_page=True)

   # Gestures use the actual pointer/touch handlers. Only the selected side
   # changes, and changing official artwork retains the user's correction.
   if composition=='wide':
    drag(page,'collar-left',35,18,touch=width<600)
    moved=selected(page,'collar')
    assert moved['easyInsigniaManualPlacement']
    assert abs(moved['collarLeftX']-35)<2 and abs(moved['collarLeftY']-18)<2,moved
    assert moved['collarRightX']==0 and moved['collarRightY']==0
    resize(page,'collar-left');resized=selected(page,'collar')
    assert resized['collarLeftScale']>1 and resized['collarRightScale']==1,resized
    pick(page,'ปกคอ','ศึกษาธิการ','collar','education-pair');swapped=selected(page,'collar')
    for key in ['collarLeftX','collarLeftY','collarRightX','collarRightY','collarLeftScale','collarRightScale']:
     assert abs(swapped[key]-resized[key])<.001,('Swapping collar art must preserve manual geometry',key)
    drag(page,'chest',-20,15,touch=width<600);chest_moved=selected(page,'chest')
    assert chest_moved['easyInsigniaManualPlacement'] and abs(chest_moved['x']+20)<2
    pick(page,'เข็มติดอก','อบต.','chest','sao');chest_swapped=selected(page,'chest')
    for key in ['x','y','scale','rotation']:assert abs(chest_swapped[key]-chest_moved[key])<.001

   # Removing one category preserves all other real layers and the suit.
   previous=layers(page);panel=page.locator('.thai-mobile-result-insignia-panel')
   panel.get_by_role('button',name='เข็มติดอก',exact=True).click();panel.get_by_role('button',name='ไม่ติด',exact=True).click()
   page.wait_for_function('!insigniaLayers().some(l=>l.kind==="chest")')
   assert selected(page,'collar') and selected(page,'ribbon')
   suit=selected(page,'suit');assert suit['sourceFrame']==page.evaluate('insigniaFixture.frame')
   assert suit['x']==0 and suit['y']==0 and suit['scale']==1

   if width==1440 and gender=='female' and composition=='wide':
    # Exercise the normal authorized export with a local callback. No wallet
    # route or filesystem download is used, but the actual native compositor
    # and crop/export pipeline must deliver a real PNG containing the ribbon.
    ribbon_scene=page.locator('[data-kind="ribbon"]').evaluate('(node)=>({x:parseFloat(node.style.left)*9,y:parseFloat(node.style.top)*12,w:parseFloat(node.style.width)*9,h:parseFloat(node.style.height)*12})')
    page.locator('.thai-mobile-result-download').click()
    expect(page.locator('.en-download-primary')).to_be_enabled(timeout=30000)
    page.locator('.en-download-primary').click()
    page.wait_for_function('insigniaFixture.exports.length===1',timeout=30000)
    exported=page.evaluate('''async box=>{
     const file=insigniaFixture.exports[0],image=new Image();image.src=file.url;await image.decode();
     const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);
     const left=Math.floor(box.x/900*c.width),top=Math.floor(box.y/1200*c.height),width=Math.max(1,Math.ceil(box.w/900*c.width)),height=Math.max(1,Math.ceil(box.h/1200*c.height));
     const data=ctx.getImageData(left,top,width,height).data;let coloured=0;
     for(let p=0;p<data.length;p+=4)if(Math.max(data[p],data[p+1],data[p+2])-Math.min(data[p],data[p+1],data[p+2])>40)coloured++;
     return {width:image.width,height:image.height,type:file.type,bytes:file.size,coloured};
    }''',ribbon_scene)
    assert exported['type']=='image/png' and exported['bytes']>10000
    assert exported['width']>=2000 and exported['height']>=3000
    assert exported['coloured']>100,'Export must contain the real coloured ribbon at its edited position'
    close=page.get_by_role('button',name='ปิดหน้าดาวน์โหลด',exact=True)
    if close.count():close.click()
    page.get_by_role('button',name='ปรับแต่งในสตูดิโอ',exact=False).click()
    undo=page.get_by_role('button',name='ย้อนกลับ',exact=True).locator('visible=true').first
    undo.click();page.wait_for_function('insigniaLayers().some(l=>l.kind==="chest"&&l.assetId==="sao")')
    redo=page.get_by_role('button',name='ทำซ้ำ',exact=True).locator('visible=true').first
    redo.click();page.wait_for_function('!insigniaLayers().some(l=>l.kind==="chest")')
   else:
    page.screenshot(path=str(OUTPUT/f'{gender}-{composition}-{width}-edited.png'),full_page=True)
   assert page.evaluate('insigniaFixture.aiCalls')==0
   assert page.evaluate('insigniaFixture.paymentCalls')==0
   assert not errors,errors
   cases+=1;print(json.dumps({'width':width,'gender':gender,'composition':composition,'realLayerPixels':True,'nativeAspect':True,'noAiOrPayment':True}),flush=True)
   context.close()
 browser.close()
 print(json.dumps({'cases':cases,'screenshots':str(OUTPUT)}),flush=True)
