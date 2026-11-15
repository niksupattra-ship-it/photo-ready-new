"""Author reference face redactions from the pinned local landmark model; no AI calls."""
import hashlib, json, pathlib, subprocess
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
rows = json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {PRODUCTION_HAIR_CATALOG as c} from './hairstyle-catalog.js';console.log(JSON.stringify(c.filter(h=>h.interfaceLanguage==='en')))"], cwd=root))
oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page = browser.new_page()
    page.route('https://**/*',lambda r:r.abort())
    page.route('**/api/**',lambda r:r.abort())
    page.route('http://127.0.0.1:5173/',lambda r:r.fulfill(content_type='text/html',body='<title>Local reference authoring</title>'))
    page.goto('http://127.0.0.1:5173/')
    page.evaluate('''async()=>{const {loadVisionRuntime}=await import('/src/vision-runtime.js'),
      {VISION_WASM_ROOT,FACE_LANDMARK_MODEL}=await import('/src/vision-assets.js'),
      {FilesetResolver,FaceLandmarker}=await loadVisionRuntime();
      window.detector=await FaceLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(VISION_WASM_ROOT),
        {baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1})}''')
    entries = {}
    for item in rows:
        points = page.evaluate('''async({src,oval})=>{const im=new Image();im.src=src;await im.decode();
          const face=detector.detect(im).faceLandmarks?.[0];if(!face)throw Error('No reference face '+src);
          return oval.map(id=>({x:face[id].x,y:face[id].y}))}''',{'src':item['src'],'oval':oval})
        entries[item['id']] = {'preview':item['src'], 'previewSha256':hashlib.sha256((root/'public'/item['src'].lstrip('/')).read_bytes()).hexdigest(), 'faceOval':points}
    browser.close()
(root/'english-hair-boundaries.json').write_text(json.dumps(entries,indent=2)+'\n')
print('Authored',len(entries),'English reference face redactions from exact picker images.')
