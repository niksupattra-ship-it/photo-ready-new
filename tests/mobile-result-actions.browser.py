import json,os
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('RESULT_ACTIONS_BASE','http://127.0.0.1:5199')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 for width in [360,390,720]:
  for government in [0,1]:
   p=b.new_page(viewport={'width':width,'height':900});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
   p.goto(f'{BASE}/scripts/fixtures/mobile-result-actions.html?government={government}')
   row=p.get_by_role('navigation',name='เครื่องมือรูปที่เสร็จแล้ว');expect(row).to_be_visible()
   buttons=row.get_by_role('button');expect(buttons).to_have_count(4 if government else 3)
   boxes=[buttons.nth(i).bounding_box() for i in range(buttons.count())];assert max(x['y'] for x in boxes)-min(x['y'] for x in boxes)<2
   gallery=p.get_by_label('ลองเปลี่ยนทรงผม');expect(gallery).not_to_be_visible()
   slot=p.locator('.thai-mobile-result-tool-slot');row.scroll_into_view_if_needed();before=slot.bounding_box();p.evaluate('window.beforeToolScroll=scrollY')
   row.get_by_role('button',name='ทรงผม',exact=True).click();expect(gallery).to_be_visible();expect(gallery.locator('button:not(.mobile-hair-create)')).to_have_count(3)
   for card in gallery.locator('button:not(.mobile-hair-create)').all():assert card.bounding_box()['width']>=gallery.bounding_box()['width']/3-12,'Hair thumbnails fill each of three equal columns'
   gallery.get_by_role('button',name='ทรง 2',exact=True).click();p.get_by_role('button',name='สร้างรูปทรงนี้',exact=True).click();assert p.evaluate('resultActions.confirm===1&&resultActions.hair[0]==="hair-1"')
   back=p.get_by_role('button',name='ย้อนกลับไปแถวเครื่องมือ',exact=True);expect(back).to_be_visible();expect(row).not_to_be_visible()
   opened=slot.bounding_box();assert opened['y']+opened['height']<=900 and opened['y']>=0
   assert abs(p.evaluate('scrollY-window.beforeToolScroll'))<3,'Opening tools cannot move the page'
   assert opened['y']<=before['y']+3,'Picker replaces the existing tools, never opens underneath them'
   back.click();expect(row).to_be_visible();expect(gallery).not_to_be_visible()
   if government:
    row.get_by_role('button',name='เครื่องหมาย',exact=True).click();expect(p.get_by_test_id('insignia-picker')).to_be_visible();expect(gallery).not_to_be_visible();expect(row).not_to_be_visible();back.click();expect(row).to_be_visible()
   row.get_by_role('button',name='ดาวน์โหลด',exact=True).click();row.get_by_role('button',name='ปรับในสตู',exact=True).click();assert p.evaluate('resultActions.download===1&&resultActions.studio===1')
   assert p.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'No mobile horizontal overflow'
   assert not errors,errors
   p.screenshot(path=f'/tmp/result-actions-{width}-{government}.png',full_page=True);p.close()
 print(json.dumps({'cases':6,'mobileActionsAndThreeHairChoices':'passed'}));b.close()
