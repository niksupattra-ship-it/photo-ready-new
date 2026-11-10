import os,subprocess,json
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('SELECTION_BASE','http://127.0.0.1:5193')
Path('work').mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for lang in ['en','th']:
  for width in [1440,390]:
   en=lang=='en';mobile=width<600
   p=b.new_page(viewport={'width':width,'height':667 if mobile else 950},is_mobile=mobile,has_touch=mobile,accept_downloads=True);errors=[]
   p.on('pageerror',lambda e:errors.append(str(e)))
   p.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') and '/api/' not in r.request.url else r.abort())
   p.goto(base+'/scripts/fixtures/english-download.html?lang='+lang,wait_until='domcontentloaded')
   p.get_by_role('heading',name='Download your photo' if en else 'ดาวน์โหลดรูป').wait_for()
   size=p.get_by_label('Photo size' if en else 'ขนาดรูป',exact=True);size.select_option('intl-2x2-inch' if en else '2-inch')
   zoom=p.get_by_label('Crop zoom' if en else 'ซูมรูป',exact=True)
   assert zoom.is_visible(), 'PNG adjustment must be available immediately'
   preview=p.get_by_label('Photo preview' if en else 'ตัวอย่างรูป',exact=True);preview.scroll_into_view_if_needed();p.wait_for_timeout(100)
   before=preview.evaluate('(c)=>c.toDataURL()');box=preview.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2
   if mobile:
    cdp=p.context.new_cdp_session(p)
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx,'y':cy,'id':1}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx+25,'y':cy+15,'id':1}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   else:
    p.mouse.move(cx,cy);p.mouse.down();p.mouse.move(cx+35,cy+20,steps=6);p.mouse.up()
   p.wait_for_timeout(100);assert preview.evaluate('(c)=>c.toDataURL()')!=before,'Dragging must update the actual crop'
   zoom.evaluate("e=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}))}")
   p.wait_for_function("document.querySelector('input[type=range]').value==='2'")
   if mobile:
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-20,'y':cy,'id':1},{'x':cx+20,'y':cy,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-30,'y':cy,'id':1},{'x':cx+30,'y':cy,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    assert float(zoom.input_value())>2,'Pinch must zoom the photo'
   p.screenshot(path=f'work/download-png-{lang}-{width}.png',full_page=True)
   p.get_by_role('button',name='Print PDF' if en else 'PDF สำหรับพิมพ์',exact=True).click()
   p.get_by_label('Copies' if en else 'จำนวนรูป',exact=True).fill('4')
   assert p.evaluate('document.documentElement.scrollWidth<=innerWidth')
   p.screenshot(path=f'work/download-pdf-{lang}-{width}.png',full_page=True)
   if not mobile:
    with p.expect_download() as event:p.get_by_role('button',name='Download PDF' if en else 'ดาวน์โหลด PDF',exact=True).click()
    file=event.value;assert file.suggested_filename.endswith('.pdf');file.save_as('work/letter-print-test.pdf')
    info=subprocess.check_output(['pdfinfo','work/letter-print-test.pdf'],text=True);assert '612 x 792 pts' in info
   else:
    p.get_by_role('button',name='Download PDF' if en else 'ดาวน์โหลด PDF',exact=True).click()
    p.get_by_role('heading',name='Save your PDF' if en else 'บันทึก PDF',exact=True).wait_for()
    with p.expect_download() as event:p.get_by_role('link',name='Save PDF' if en else 'บันทึก PDF',exact=True).click()
    assert event.value.suggested_filename.endswith('.pdf')
    p.get_by_role('button',name='Close' if en else 'ปิด',exact=True).click()
   assert p.evaluate('downloadFixture.archives.length')>=1
   assert p.evaluate('downloadFixture.archives.at(-1).zoom')>1
   assert p.evaluate('downloadFixture.archives.at(-1).freePosition') is True
   p.get_by_role('button',name='Photo PNG' if en else 'รูป PNG',exact=True).click()
   size.select_option('original')
   assert p.get_by_label('Crop zoom' if en else 'ซูมรูป',exact=True).is_visible()
   assert p.evaluate('''async()=>{const {prepareEnglishDownload}=await import('/src/english-download.jsx');const source=downloadFixture.source;const output=await prepareEnglishDownload(source,{sizeId:'original',x:.4,y:.5,zoom:1,freePosition:true});const im=await createImageBitmap(output);const same=await crypto.subtle.digest('SHA-256',await source.arrayBuffer()),next=await crypto.subtle.digest('SHA-256',await output.arrayBuffer());const ok=im.width===900&&im.height===1200&&String(new Uint8Array(same))!==String(new Uint8Array(next));im.close();return ok}''')
   if not mobile:
    with p.expect_download() as event:p.get_by_role('button',name='Download photo' if en else 'ดาวน์โหลดรูป',exact=True).click()
    assert event.value.suggested_filename.endswith('.png')
   assert not errors,errors
   p.close()
 b.close()
 print(json.dumps({'passed':True,'checks':['Thai and English','desktop PNG drag without extra button','touch drag and pinch','immediate zoom and reset','PDF Letter in both languages','mobile save PDF','download crop retained','original PNG controls','responsive layout']}))
