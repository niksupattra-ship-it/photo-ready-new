"""Shared navigation for the desktop header and compact touch menu."""
def enter_easy_mode(page):
 desktop=page.locator('.studio-design-easy')
 if desktop.is_visible():
  desktop.click()
 else:
  dialog=page.locator('dialog.idprom-account-dialog:modal')
  if not dialog.is_visible():page.get_by_role('button',name='เมนู',exact=True).click()
  dialog.get_by_role('button',name='โหมดง่าย',exact=False).click()
