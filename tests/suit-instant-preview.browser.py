"""Hold original garment requests to verify fast first-click display and latest wins.
Previews never enter project/history; original pixels, fit and policy still commit.
"""
import json,os,pathlib,re,time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parent.parent;BASE=os.environ.get('COLLAR_CONTROLS_BASE','http://127.0.0.1:5173')
OUT=pathlib.Path('/tmp/suit-instant-preview');OUT.mkdir(exist_ok=True)
catalog=re.search(r'const JOB_UNIFORMS=\[[\s\S]*?\n\];',(ROOT/'src/main.jsx').read_text()).group(0)
ids=['female-suit-03','female-navy-suit-6','male-suit-04','female-lapel-suit']
paths=['/assets/job-uniforms/'+id+'.png'for id in ids]
with sync_playwright()as w:
 browser=w.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 results=[]
 for width,height,touch,processed in [(1440,1000,False,False),(390,844,True,False),(1180,820,True,True)]:
  p=browser.new_page(viewport={'width':width,'height':height},has_touch=touch);p.set_default_timeout(12000)
  held={};errors=[];api=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda r:api.append(r.url)if '/api/'in r.url else None)
  def full_file(r):held[urlparse(r.request.url).path]=r
  for path in paths:p.route('**'+path,full_file)
  seed=catalog+'''\nconst instantOptions=JOB_UNIFORMS.filter(t=>IDS.includes(t.id)).map(t=>({...t,name:t.title,preview:t.img,group:'สมัครงาน'}));
const portrait=document.createElement('canvas');portrait.width=900;portrait.height=1200;const q=portrait.getContext('2d');q.fillStyle='#d7a58a';q.beginPath();q.ellipse(450,390,162,220,0,0,Math.PI*2);q.fill();q.fillRect(380,580,140,350);
const face=Array.from({length:470},()=>({x:.5,y:.34}));Object.assign(face,{10:{x:.5,y:.15},152:{x:.5,y:.52},234:{x:.32,y:.34},454:{x:.68,y:.34},33:{x:.4,y:.32},263:{x:.6,y:.32}});
window.suitPolicies=[];
const instantLayers=[{name:'พื้นหลัง',kind:'background',source:bg},...(PROCESSED?[{id:'fixture-head',name:'หัว · คอ · ผม',kind:'head',jobId:'fixture-job',source:portrait.toDataURL(),sourceFrame:{x:0,y:0,w:900,h:1200}}]:[]),{name:'ชุด',kind:'suit',source:suit,templatePath:suit,sourceFrame:{x:0,y:500,w:900,h:768}}];
'''.replace('IDS',json.dumps(ids)).replace('PROCESSED','true'if processed else'false')
  def fixture(r):
   response=r.fetch();s=response.text()
   for a,b in [('initialEasy: true,','initialEasy: false, purchaseSnapshotRef: (window.instantSnapshot={current:null}),'),('templates: suits,','templates: instantOptions,'),('freeTemplatePaths: [suit,','freeTemplatePaths: [...instantOptions.map(t=>t.template),suit,')]:assert s.count(a)==1;s=s.replace(a,b,1)
   a=s.index('\tinitialLayers: [');b=s.index('\n\tplacement:',a);s=s[:a]+'initialLayers: instantLayers,'+s[b:]
   s,n=re.subn(r'onSelectSuit: async \(\) => \(\{[\s\S]*?\}\),',"onSelectSuit: async(jobId,templates)=>{window.suitPolicies.push(templates);if(window.rejectSuit)throw Error('policy denied');return {limited:false,choices:[]}}, onMeasureSuitFace: async()=>face,",s,count=1);assert n==1
   marker='createRoot(document.getElementById("root"))';r.fulfill(response=response,body=s.replace(marker,seed+'\n'+marker,1))
  def readonly(r):
   response=r.fetch();s=response.text();marker='const easyUi =';assert marker in s
   code="window.suitProbe=()=>{const suit=state.current.find(l=>l.kind==='suit'),request=suitRequestRef.current;return {committed:suit?.assetId||null,fullWidth:assets.current.get(suit?.id)?.original?.width,preview:request?.preview?.layer.assetId||null,previewWidth:request?.preview?.asset.original.width,phase:request?.phase,undo:undo.current.length,warm:JSON.parse(JSON.stringify(Object.fromEntries("+json.dumps(paths)+".map(path=>[path,!!readSuitPreview(path)]))))}};\n"
   r.fulfill(response=response,body=s.replace(marker,code+marker,1))
  p.route('**/scripts/fixtures/easy-mode.jsx*',fixture);p.route('**/src/studio-editor.jsx*',readonly)
  action=lambda locator:locator.tap()if touch else locator.click()
  card=lambda id:p.get_by_role('button',name='เลือกชุด '+{'female-suit-03':'สูทหญิง แบบ 3','female-navy-suit-6':'สูทชาย แบบ 6','male-suit-04':'สูทชาย แบบ 4','female-lapel-suit':'สูทหญิงคอแบะ'}[id],exact=True)
  release=lambda path:held.pop(path).continue_()
  def wait_held(path):
   deadline=time.monotonic()+5
   while path not in held and time.monotonic()<deadline:p.wait_for_timeout(10)
   assert path in held,path
  try:
   p.goto(BASE+'/scripts/fixtures/easy-mode.html',wait_until='networkidle');p.add_style_tag(url=BASE+'/src/style.css');p.wait_for_load_state('networkidle')
   action(p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True))
   p.wait_for_function('Object.values(window.suitProbe().warm).every(Boolean)')
   assert not held,'Full PNG files loaded before the user chose a suit'
   p.evaluate("()=>{window.suitPaints=[];window.suitClickAt=0;document.addEventListener('click',e=>{if(e.target.closest('button')?.getAttribute('aria-label')?.startsWith('เลือกชุด '))window.suitClickAt=performance.now()},true);document.querySelector('.studio-stage > canvas').addEventListener('studio-paint',()=>{const v=window.suitProbe();if(v.preview)window.suitPaints.push({id:v.preview,ms:performance.now()-window.suitClickAt})})}")
   canvas=p.locator('.studio-stage > canvas');before=canvas.evaluate('c=>c.toDataURL()')
   action(card(ids[0]));p.wait_for_function('window.suitProbe().preview===\'female-suit-03\'')
   wait_held(paths[0]);assert p.evaluate('window.suitProbe().committed')is None
   assert p.evaluate('window.suitProbe().previewWidth')<=512
   assert canvas.evaluate('c=>c.toDataURL()')!=before,'The actual workspace did not change while the original was held'
   expect(p.get_by_role('button',name='ดาวน์โหลดรูป',exact=True)).to_be_disabled()
   expect(card(ids[1])).to_be_enabled();action(card(ids[1]));p.wait_for_function('window.suitProbe().preview===\'female-navy-suit-6\'')
   wait_held(paths[1]);assert p.evaluate('window.suitProbe().committed')is None
   expect(card(ids[1])).to_have_class('active')
   paints=p.evaluate('window.suitPaints');latencies={id:next(row['ms']for row in paints if row['id']==id)for id in ids[:2]}
   assert all(ms<150 for ms in latencies.values()),latencies
   p.screenshot(path=str(OUT/f'pending-{width}.png'))
   release(paths[1]);p.wait_for_function('window.suitProbe().committed===\'female-navy-suit-6\'&&!window.suitProbe().preview')
   assert p.evaluate('window.suitProbe().fullWidth')==1504
   assert p.evaluate('window.suitProbe().undo')==1,'Cancelled clicks entered history'
   assert p.evaluate('window.suitPolicies.length')==(1 if processed else 0)
   release(paths[0]);p.wait_for_timeout(120)
   assert p.evaluate('window.suitProbe().committed')==ids[1],'An older download overwrote the last choice'
   action(p.get_by_role('button',name='ย้อนกลับ',exact=True));p.wait_for_function('window.suitProbe().committed===null')
   action(p.get_by_role('button',name='ทำซ้ำ',exact=True));p.wait_for_function('window.suitProbe().committed===\'female-navy-suit-6\'')
   if touch and not p.locator('.studio-picker-drawer').count():action(p.locator('.studio-bottom-choices').get_by_role('button',name='ชุด',exact=True))
   committed=canvas.evaluate('c=>c.toDataURL()');undo_before=p.evaluate('window.suitProbe().undo')
   action(card(ids[2]));p.wait_for_function('window.suitProbe().preview===\'male-suit-04\'');wait_held(paths[2])
   action(card(ids[1]));p.wait_for_function('!window.suitProbe().preview')
   assert p.evaluate('window.suitProbe().committed')==ids[1];assert p.evaluate('window.suitProbe().undo')==undo_before
   held.pop(paths[2]).abort('failed');p.wait_for_timeout(60)
   assert canvas.evaluate('c=>c.toDataURL()')==committed
   action(card(ids[3]));p.wait_for_function('window.suitProbe().preview===\'female-lapel-suit\'')
   wait_held(paths[3]);held.pop(paths[3]).abort('failed')
   p.wait_for_function('!window.suitProbe().preview');expect(card(ids[0])).to_be_enabled()
   assert p.evaluate('window.suitProbe().committed')==ids[1]
   assert canvas.evaluate('c=>c.toDataURL()')==committed,'Failure did not restore the committed high-resolution canvas'
   if processed:
    p.evaluate('window.rejectSuit=true');action(card(ids[0]))
    p.wait_for_function('window.suitPolicies.length===2&&!window.suitProbe().preview')
    assert p.evaluate('window.suitProbe().committed')==ids[1],'Policy rejection retained an unapproved preview'
   assert not errors,errors;assert not api,api
   results.append({'viewport':[width,height],'processed':processed,'firstPaintMs':latencies,'originalsHeldUntilRelease':True,'fullResolution':1504,'lastChoiceWins':True,'undoRedo':True,'failureRestoresOriginal':True,'policyRollback':processed})
   print(json.dumps(results[-1]),flush=True)
  except Exception as e:
   p.screenshot(path=str(OUT/f'error-{width}.png'));print(json.dumps({'error':str(e),'viewport':[width,height],'pageErrors':errors},ensure_ascii=False),flush=True);raise
  finally:
   for route in list(held.values()):
    try:route.abort()
    except:pass
   p.close()
 browser.close()
print(json.dumps({'passed':results,'apiCalls':0},ensure_ascii=False))
