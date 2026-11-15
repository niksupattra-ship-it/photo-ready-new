"""Native-only garment display, cold loads and rapid swaps; no live APIs."""
import json, os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('COLLAR_CONTROLS_BASE', 'http://127.0.0.1:5173')
IDS = ['female-job-ivory-bow-blouse', 'female-job-light-pink-tweed-pearl-trim',
       'female-job-navy-suit-gathered-cream-blouse', 'female-job-dusty-rose-tweed-pearl-buttons']
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                 args=['--no-sandbox', '--disable-dev-shm-usage'])
    for lang, width, easy in [(lang, width, easy) for lang in ['en', 'th']
                             for width in [1440, 390] for easy in ([False] if lang=='en' else [False, True])]:
        p = browser.new_page(viewport={'width': width, 'height': 1000}, has_touch=width < 600)
        p.set_default_timeout(20000)
        held, errors, external = {}, [], []
        p.on('pageerror', lambda e: errors.append(str(e)))
        def route(r):
            url = r.request.url.split('?')[0]
            if not url.startswith(BASE + '/') or '/api/' in url:
                external.append(url)
                r.abort()
            elif any(url == BASE + '/assets/job-uniforms/' + id + '.png' for id in IDS):
                held[url.rsplit('/', 1)[-1][:-4]] = r
            else:
                r.continue_()
        p.route('**/*', route)
        def card(i):
            if easy:
                return p.locator('.easy-suit-grid button').filter(has=p.locator('img[src*="' + IDS[i] + '"]'))
            return p.locator('.studio-catalog-grid button').filter(has=p.locator('img[src*="' + IDS[i] + '"]'))
        def settle(n, reject=False):
            p.evaluate('([n,reject])=>suitFixture.policyGates[n][reject?"reject":"resolve"](reject?Error("fixture rejection"):undefined)', [n,reject])
        def gate(n):
            p.wait_for_function('n=>suitFixture.policyGates.length===n', arg=n)
        def selected():
            return p.evaluate('suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId||null')
        try:
            p.goto(BASE + '/scripts/fixtures/suit-instant-preview.html?lang=' + lang + '&detail=1' + ('&easy=1' if easy else ''), wait_until='domcontentloaded')
            p.wait_for_function('!!suitFixture.snapshot.current')
            if easy:
                p.locator('.easy-tabs').get_by_role('button', name='Outfit' if lang=='en' else 'ชุด', exact=True).click()
                p.locator('.easy-suit-category-grid button').first.click()
            else:
                p.locator('.studio-bottom-choices').get_by_role('button', name='Outfit' if lang=='en' else 'ชุด', exact=True).click()
            card(0).locator('img').evaluate('async im=>await im.decode()')
            p.evaluate('''()=>{const c=document.querySelector('.studio-stage>canvas');
              window.sceneHash=()=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
                let h=2166136261;for(let i=0;i<d.length;i+=4)h=Math.imul(h^d[i]^d[i+1]^d[i+2]^d[i+3],16777619);return h};
              window.initialHash=sceneHash();suitFixture.holdPolicies=true}''')
            card(0).click()
            p.wait_for_timeout(120)
            assert p.evaluate('sceneHash()===initialHash'), 'A thumbnail replaced the stage before the native image loaded'
            assert selected() is None
            assert IDS[0] in held
            held.pop(IDS[0]).continue_()
            gate(1)
            p.wait_for_function('sceneHash()!==initialHash')
            first = p.evaluate('sceneHash()')
            # A new cold choice must keep the displayed previous preview alive.
            card(2).click()
            p.wait_for_timeout(150)
            assert p.evaluate('sceneHash()') == first, 'Cold swap flashed committed/thumbnail pixels'
            assert IDS[2] in held
            # Easy-mode mirrors must also keep the currently displayed frame.
            p.evaluate('''()=>{const c=document.querySelector('.studio-stage>canvas');c.dispatchEvent(new Event('studio-paint'))}''')
            if easy:
                assert p.locator('.easy-preview>canvas').evaluate('(c)=>c.width>1&&c.height>1')
            held.pop(IDS[2]).continue_()
            gate(2)
            p.wait_for_function('h=>sceneHash()!==h', arg=first)
            second = p.evaluate('sceneHash()')
            settle(0)
            p.wait_for_timeout(100)
            assert selected() is None and p.evaluate('sceneHash()') == second
            settle(1)
            p.wait_for_function('id=>suitFixture.snapshot.current().layers.find(l=>l.kind==="suit").assetId===id', arg=IDS[2])
            if lang == 'en':
                assert p.evaluate('sceneHash()') == second, 'Native preview pixels changed at commit'
            # Returning to a prefetched image does not need another network load.
            card(0).click()
            gate(3)
            settle(2, True)
            p.wait_for_timeout(150)
            assert selected() == IDS[2], 'Failed rights read changed the committed garment'
            assert p.evaluate('suitFixture.aiCalls') == 0
            assert not errors, errors
            assert not external, external
            results.append({'language':lang,'width':width,'easy':easy,'passed':True})
            print(json.dumps(results[-1]), flush=True)
        finally:
            for r in held.values():
                r.abort()
            p.close()
    browser.close()
print(json.dumps({'passed':len(results),'scope':'Local real editor and native assets; cold-load retention, full-detail handoff, stale response and failure rollback.'}))
