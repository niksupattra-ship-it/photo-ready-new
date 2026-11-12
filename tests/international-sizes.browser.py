"""Exercise actual home/crop components and native PNG export; local assets only."""
from playwright.sync_api import sync_playwright
import json
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);out=[]
 for lang in ['th','en']:
  for width in [390,1440]:
   p=b.new_page(viewport={'width':width,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   p.route('**/*',lambda r:r.continue_()if r.request.url.startswith('http://127.0.0.1:5192/')else r.abort())
   p.goto('http://127.0.0.1:5192/scripts/fixtures/international-sizes.html?lang='+lang)
   p.wait_for_selector('.home-photo-sizes-options button');p.wait_for_selector('.photo-size-options button')
   ids=p.evaluate('sizeFixture.presets.map(s=>s.id)')
   assert ids==(['original','35x45','intl-2x2-inch','33x48','50x70']if lang=='en'else['original','1-inch','1.5-inch','2-inch','2.5-inch','3-inch','2x2-inch','33x48','35x45'])
   if lang=='en':assert p.locator('.photo-size-options button').first.get_attribute('aria-pressed')=='true','Old Thai crop must reset to the displayed original preset'
   home=p.locator('.home-photo-sizes-options button');assert home.count()==6
   for i in range(1,5):
    home.nth(i).click();p.wait_for_timeout(60)
    assert home.nth(i).get_attribute('aria-pressed')=='true'
   pdf_option=home.nth(5);assert ('PDF (Letter)' if lang=='en' else 'PDF (A4)') in pdf_option.inner_text()
   pdf_option.click();assert pdf_option.get_attribute('aria-pressed')=='true'
   sheet=p.locator('.home-photo-sizes-pdf-sheet')
   assert sheet.count()==1 and sheet.get_attribute('data-paper')==('Letter' if lang=='en' else 'A4')
   assert sheet.locator('.home-photo-sizes-pdf-photo img').count()==int(sheet.get_attribute('data-layout-count'))
   assert sheet.locator('img').count()>10
   assert ('Letter' if lang=='en' else 'A4') in p.locator('.home-photo-sizes-result').inner_text()
   assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'PDF overflow {lang} {width}'
   home.nth(0).click();assert sheet.count()==0
   assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow {lang} {width}'
   for i in range(1,len(ids)):
    p.locator('.photo-size-options button').nth(i).click()
    assert p.locator('.photo-size-options button').nth(i).get_attribute('aria-pressed')=='true'
   results=p.evaluate('''async()=>{
    const {blob,cropPhotoForDownload,presets}=sizeFixture,output=[];
    if(await cropPhotoForDownload(blob,{sizeId:'original'})!==blob)throw Error('Original changed');
    for(const size of presets.filter(s=>s.width)){
     const png=await cropPhotoForDownload(blob,{sizeId:size.id,x:.5,y:.5,zoom:1},{pixelScale:2});
     const im=await createImageBitmap(png),w=Math.round(size.width/25.4*300)*2,h=Math.round(size.height/25.4*300)*2;
     if(im.width!==w||im.height!==h)throw Error('Wrong export '+size.id);
     const bytes=new Uint8Array(await png.arrayBuffer()),view=new DataView(bytes.buffer);
     if(String.fromCharCode(...bytes.slice(37,41))!=='pHYs'||view.getUint32(41)!==Math.round(600/.0254))throw Error('Wrong print resolution');
     output.push({id:size.id,width:im.width,height:im.height});im.close();
    }return output;
   }''')
   assert not errors,errors
   if lang=='en':assert '1.5 in'not in p.locator('.home-photo-sizes-options').inner_text()
   out.append({'language':lang,'viewport':width,'exports':results});p.close()
 b.close()
print(json.dumps(out,indent=2))
