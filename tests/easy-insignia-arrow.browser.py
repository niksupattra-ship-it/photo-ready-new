"""Easy Mode outside arrows move native pins without obscuring art; no paid calls."""
import os,json
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('REFIT_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  p=b.new_page(viewport={'width':width,'height':1000});p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/government-result-insignia.html?gender=female&fullbody=1&labComplete=1')
  if width<=720:
   launch=p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='เครื่องหมาย',exact=True);expect(launch).to_be_enabled();launch.click()
  panel=p.locator('.thai-mobile-result-insignia-panel');panel.get_by_role('button',name='ปกคอ',exact=True).click();panel.get_by_role('button',name='มท.',exact=True).click()
  handle=p.locator('[data-kind="collar-left"]');expect(handle).to_be_visible();p.wait_for_timeout(300);box=handle.bounding_box();p.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
  arrow=handle.get_by_role('button',name='ลากเพื่อย้ายเครื่องหมาย',exact=True);expect(arrow).to_be_visible();r=arrow.bounding_box();assert r['width']>=44 and r['height']>=44
  assert r['x']>=box['x']+box['width']+6 or r['x']+r['width']<=box['x']-6,(box,r)
  assert handle.evaluate('(e)=>getComputedStyle(e).borderTopWidth')=='0px';assert p.locator('[data-insignia-resize]').count()==0
  old=p.evaluate("insigniaLayers().find(l=>l.kind==='collar')");x=r['x']+22;y=r['y']+22
  if width==390:
   c=p.context.new_cdp_session(p);c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]});c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+12,'y':y+9,'id':1}]});c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:
   p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+12,y+9,steps=4);p.mouse.up()
  p.wait_for_timeout(200);new=p.evaluate("insigniaLayers().find(l=>l.kind==='collar')");assert new['collarLeftX']>old['collarLeftX'] and new['collarLeftY']>old['collarLeftY'];assert new['collarLeftScale']==old['collarLeftScale'];assert new['collarRightX']==old['collarRightX']
  arrow.focus();arrow.press('ArrowLeft');p.wait_for_timeout(150);assert p.evaluate("insigniaLayers().find(l=>l.kind==='collar').collarLeftX")<new['collarLeftX']
  r=arrow.bounding_box();x=r['x']+22;y=r['y']+22;c=p.context.new_cdp_session(p)
  c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x-8,'y':y,'id':1}]})
  c.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x-8,'y':y,'id':1},{'x':x+8,'y':y,'id':2}]})
  c.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-14,'y':y,'id':1},{'x':x+14,'y':y,'id':2}]})
  c.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});p.wait_for_timeout(150)
  assert p.evaluate("insigniaLayers().find(l=>l.kind==='collar').collarLeftScale")>new['collarLeftScale']
  p.screenshot(path='/tmp/easy-arrow-'+str(width)+'.png');assert p.evaluate('insigniaFixture.aiCalls+insigniaFixture.paymentCalls')==0
  print(json.dumps({'width':width,'arrowOutsideBadge':True,'touchTarget':44,'dragMovesWithoutResizing':True,'keyboardMoves':True,'pinchResizePreserved':True}),flush=True);p.close()
 b.close()
