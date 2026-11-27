"""Real native badge assets measured on a changed finished portrait; no AI/payment calls."""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('REFIT_BASE','http://127.0.0.1:5228')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1280]:
  p=b.new_page(viewport={'width':width,'height':1000});p.on('pageerror',lambda e:print(str(e),flush=True))
  def expose(route):
   r=route.fetch();s=r.text().replace('const selectAsset = async', 'const selectAsset = async')
   marker='const selectAsset = async' if 'const selectAsset = async' in s else 'const selectAsset=async'
   hook='''window.__refit={ready:ready&&!assetBusy&&!processActive,swap:async()=>{
    const old=state.current.find(l=>l.kind==='head'),im=await image(old.source),c=canvas(),ctx=c.getContext('2d');ctx.drawImage(im,0,65,900,1200);
    const next={...old,source:c.toDataURL(),jobId:'new-hair-job'},scene=state.current.map(l=>l.id===old.id?next:l);if(!await hydrate(scene))throw Error('hydrate');
    await refitSelectedInsigniaAfterResult(old,next);return {unchangedHead:state.current.find(l=>l.id===old.id).source===next.source};
   }};\n'''
   assert marker in s;route.fulfill(response=r,body=s.replace(marker,hook+marker,1))
  p.route('**/src/studio-editor.jsx*',expose);p.route('**/api/**',lambda r:r.abort())
  p.goto(BASE+'/scripts/fixtures/government-result-insignia.html?gender=female&fullbody=1&labComplete=1');p.wait_for_function('window.__refit?.ready')
  if width<=720:p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว').get_by_role('button',name='เครื่องหมาย',exact=True).click()
  panel=p.locator('.thai-mobile-result-insignia-panel')
  for tab,label,kind in [('ปกคอ','มท.','collar'),('เข็มติดอก','อบจ.','chest'),('แพรแถบ','2504-2514','ribbon')]:
   panel.get_by_role('button',name=tab,exact=True).click();panel.get_by_role('button',name=label,exact=True).click();p.wait_for_function('(kind)=>insigniaLayers().some(l=>l.kind===kind)',arg=kind);p.wait_for_function('__refit.ready')
  old=p.evaluate('insigniaLayers()');bounds={k:p.evaluate('(k)=>insigniaAlpha(k)',k)['bounds'] for k in ['collar','chest','ribbon']};result=p.evaluate('__refit.swap()');new=p.evaluate('insigniaLayers()');assert result['unchangedHead']
  for kind in ['collar','chest','ribbon']:
   a=next(l for l in old if l['kind']==kind);d=next(l for l in new if l['kind']==kind);assert a['assetId']==d['assetId'];assert a['sourceFrame']!=d['sourceFrame'] or bounds[kind]!=p.evaluate('(k)=>insigniaAlpha(k)',kind)['bounds'],(kind,a,d)
  assert p.evaluate('insigniaFixture.aiCalls+insigniaFixture.paymentCalls')==0
  print(json.dumps({'width':width,'selectedBadgesRepositioned':3,'headPixelsPreserved':True,'providerCalls':0}),flush=True);p.close()
 b.close()
