"""Automatic pre-AI soft skin with real MediaPipe evidence on public app photos.

No provider, account or payment calls. The third portrait is explicitly a
synthetic fine-line fixture; its extra lines are not customer skin or AI output.
"""
import base64, hashlib, json, os, pathlib, urllib.request
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get('STUDIO_SOFT_BASE', 'http://127.0.0.1:5176')
OUT = pathlib.Path(os.environ.get('STUDIO_SOFT_OUTPUT', '/tmp/studio-skin-soft-focus-browser'))
OUT.mkdir(parents=True, exist_ok=True)
CACHE = pathlib.Path(os.environ.get('STUDIO_SOFT_MODEL_CACHE', '/tmp/idprom-mediapipe-model-cache'))
FACE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
SEGMENT = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'
WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/'
PACKAGE = ROOT / 'node_modules/@mediapipe/tasks-vision'
assert json.loads((PACKAGE / 'package.json').read_text())['version'] == '1.0.1'
models, provenance = {}, []
for url in [FACE, SEGMENT]:
    path = CACHE / url.rsplit('/', 1)[1]
    if path.exists():
        data = path.read_bytes()
    else:
        with urllib.request.urlopen(url, timeout=45) as response:
            data = response.read()
    assert len(data) > 10000
    models[url] = data
    provenance.append({'url': url, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--disable-dev-shm-usage', '--disk-cache-size=1', '--media-cache-size=1'])
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(120000)
    errors, api, unexpected, blocked_telemetry = [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route(request):
        url = request.request.url
        if '/api/' in url:
            api.append(url)
            request.abort()
        elif url.startswith('https://odml.pa.googleapis.com/v1/log'):
            blocked_telemetry.append(url)
            request.abort()
        elif url in models:
            request.fulfill(status=200, content_type='application/octet-stream', body=models[url])
        elif url.startswith(WASM):
            path = PACKAGE / 'wasm' / url.rsplit('/', 1)[1]
            assert path.is_file() and path.parent == PACKAGE / 'wasm'
            request.fulfill(status=200, content_type='application/wasm' if path.suffix == '.wasm' else 'application/javascript', body=path.read_bytes())
        elif url == BASE + '/tests/studio-skin-soft-focus.html':
            request.fulfill(status=200, content_type='text/html', body='<html><body>Automatic soft skin pixel checks</body></html>')
        elif url.startswith(BASE + '/'):
            request.continue_()
        else:
            unexpected.append(url)
            request.abort()

    page.route('**/*', route)
    page.goto(BASE + '/tests/studio-skin-soft-focus.html')
    page.evaluate('''async({faceUrl, segmentUrl, wasm}) => {
      const {loadVisionRuntime} = await import('/src/vision-runtime.js');
      const {FaceLandmarker, ImageSegmenter, FilesetResolver} = await loadVisionRuntime();
      const files = await FilesetResolver.forVisionTasks(wasm);
      window.softLandmarker = await FaceLandmarker.createFromOptions(files, {baseOptions:{modelAssetPath:faceUrl}, runningMode:'IMAGE', numFaces:1});
      window.softSegmenter = await ImageSegmenter.createFromOptions(files, {baseOptions:{modelAssetPath:segmentUrl}, runningMode:'IMAGE', outputCategoryMask:true, outputConfidenceMasks:false});
    }''', {'faceUrl': FACE, 'segmentUrl': SEGMENT, 'wasm': WASM})
    results = []
    fixtures = [
        {'source': '/assets/face-finish/natural.webp', 'synthetic': False},
        {'source': '/assets/job-uniforms/female-suit-04-v2-example.webp', 'synthetic': False},
        {'source': '/assets/face-finish/natural.webp', 'synthetic': True},
    ]
    for number, fixture in enumerate(fixtures, 1):
        result = page.evaluate('''async({source, synthetic}) => {
          const {captureStudioSkinEvidence} = await import('/src/studio-skin-evidence.js');
          const {applyStudioSkinBase, STUDIO_SKIN_WORKFLOW_VERSION} = await import('/studio-skin-treatment.js');
          const {applyStudioSkinSoftFocus} = await import('/studio-skin-soft-focus.js');
          const decode = async blob => {const url=URL.createObjectURL(blob), image=new Image(); try {image.src=url; await image.decode(); return image} finally {URL.revokeObjectURL(url)}};
          let blob = await (await fetch(source)).blob(), image = await decode(blob);
          const W=image.naturalWidth, H=image.naturalHeight, canvas=Object.assign(document.createElement('canvas'),{width:W,height:H}), ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(image,0,0);
          let syntheticRegion=null;
          if (synthetic) {
            const face=softLandmarker.detect(image).faceLandmarks[0], a=face[234], b=face[454], fw=Math.hypot((b.x-a.x)*W,(b.y-a.y)*H), cx=(a.x+b.x)*W/2;
            const top=face[10].y*H, brow=Math.min(face[105].y,face[334].y)*H, cy=top+(brow-top)*.52;
            const data=ctx.getImageData(0,0,W,H);
            syntheticRegion={left:Math.round(cx-fw*.18),right:Math.round(cx+fw*.18),top:Math.round(cy-fw*.035),bottom:Math.round(cy+fw*.035),cx,cy,faceWidth:fw};
            for(let y=syntheticRegion.top;y<syntheticRegion.bottom;y++) for(let x=syntheticRegion.left;x<syntheticRegion.right;x++) {
              const k=(y*W+x)*4, envelope=Math.sin(Math.PI*(x-syntheticRegion.left)/(syntheticRegion.right-syntheticRegion.left))**2;
              const fine=2.5*Math.sin(x*1.7)*Math.cos(y*1.2), line=-9*Math.exp(-Math.pow((y-cy-Math.sin((x-cx)/fw*8)*.8)/.9,2))*envelope;
              for(let c=0;c<3;c++) data.data[k+c]+=fine+line;
            }
            ctx.putImageData(data,0,0);
            blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); image=await decode(blob);
          }
          const evidence=await captureStudioSkinEvidence(blob,{decode,landmarker:softLandmarker,segmenter:softSegmenter,signal:{get aborted(){return false}}});
          const original=ctx.getImageData(0,0,W,H), originalCopy=original.data.slice(), before=canvas.toDataURL('image/png');
          const base=applyStudioSkinBase({pixels:original.data,width:W,height:H,evidence}), baseCopy=base.pixels.slice();
          ctx.putImageData(new ImageData(new Uint8ClampedArray(base.pixels),W,H),0,0);const baseImage=canvas.toDataURL('image/png');
          const started=performance.now(), soft=applyStudioSkinSoftFocus({pixels:base.pixels,width:W,height:H,evidence}), elapsedMs=performance.now()-started;
          if(!soft?.pixels||soft.pixels.length!==W*H*4) throw Error('Invalid native output');
          let alphaMismatch=0,outsideMismatch=0,inputMismatch=0,protectedMismatch=0,changed=0,maxDelta=0;
          for(let i=0;i<W*H;i++) {
            const x=i%W,y=Math.floor(i/W),k=i*4,label=evidence.labels[Math.min(evidence.maskHeight-1,Math.floor(y*evidence.maskHeight/H))*evidence.maskWidth+Math.min(evidence.maskWidth-1,Math.floor(x*evidence.maskWidth/W))];
            if(soft.pixels[k+3]!==baseCopy[k+3]) alphaMismatch++;
            let different=false;
            for(let c=0;c<4;c++) {
              if(base.pixels[k+c]!==baseCopy[k+c]||original.data[k+c]!==originalCopy[k+c]) inputMismatch++;
              if(label!==2&&label!==3&&soft.pixels[k+c]!==baseCopy[k+c]) outsideMismatch++;
              if(c<3&&soft.pixels[k+c]!==baseCopy[k+c]) {different=true; maxDelta=Math.max(maxDelta,Math.abs(soft.pixels[k+c]-baseCopy[k+c]))}
            }
            if(different) changed++;
          }
          for(const id of [33,263,70,300,61,291,98,327]) {
            const p=evidence.face[id],k=(Math.min(H-1,Math.max(0,Math.floor(p[1]*H)))*W+Math.min(W-1,Math.max(0,Math.floor(p[0]*W))))*4;
            for(let c=0;c<4;c++) if(soft.pixels[k+c]!==baseCopy[k+c]) protectedMismatch++;
          }
          let syntheticLineContrast=null;
          if(syntheticRegion) {
            const g=syntheticRegion, light=(pixels,x,y)=>{const k=(Math.max(0,Math.min(H-1,y))*W+Math.max(0,Math.min(W-1,x)))*4;return pixels[k]*.2126+pixels[k+1]*.7152+pixels[k+2]*.0722};
            const measure=pixels=>{let sum=0,count=0;for(let x=Math.round(g.cx-g.faceWidth*.12);x<g.cx+g.faceWidth*.12;x++) {const y=Math.round(g.cy+Math.sin((x-g.cx)/g.faceWidth*8)*.8);sum+=Math.max(0,(light(pixels,x,y-4)+light(pixels,x,y+4))*.5-light(pixels,x,y));count++}return sum/count};
            const beforeContrast=measure(originalCopy),baseContrast=measure(baseCopy),afterContrast=measure(soft.pixels);
            syntheticLineContrast={before:beforeContrast,base:baseContrast,after:afterContrast,retainedRatio:baseContrast?afterContrast/baseContrast:0};
          }
          ctx.putImageData(new ImageData(new Uint8ClampedArray(soft.pixels),W,H),0,0);
          return {source,syntheticFineLineFixture:synthetic,syntheticRegion,syntheticLineContrast,width:W,height:H,version:STUDIO_SKIN_WORKFLOW_VERSION,faceLandmarks:evidence.face.length,evidenceMask:[evidence.maskWidth,evidence.maskHeight],baseReport:base.report,softReport:soft.report,elapsedMs,changedPixels:changed,maxChannelDelta:maxDelta,alphaMismatch,outsideMismatch,inputMismatch,protectedMismatch,before,base:baseImage,after:canvas.toDataURL('image/png')};
        }''', fixture)
        for key in ['before', 'base', 'after']:
            (OUT / f'{number}-{key}.png').write_bytes(base64.b64decode(result.pop(key).split(',', 1)[1]))
        assert result['version'] == 'studio-skin-stages-v2', result
        assert result['faceLandmarks'] in [468, 478], result
        assert all(result[key] == 0 for key in ['alphaMismatch', 'outsideMismatch', 'inputMismatch', 'protectedMismatch']), result
        assert result['changedPixels'] > 64, result
        assert result['elapsedMs'] < 10000, result
        if fixture['synthetic']:
            assert result['syntheticLineContrast']['base'] > 3, result
            assert result['syntheticLineContrast']['retainedRatio'] < .9, result
        results.append(result)
        print(json.dumps(result), flush=True)
    page.evaluate('()=>{softLandmarker.close();softSegmenter.close()}')
    browser.close()
    assert not errors, errors
    assert not api, api
    assert not unexpected, unexpected
    source_hashes = {name: hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['studio-skin-treatment.js', 'studio-skin-soft-focus.js', 'src/studio-skin-evidence.js']}
    proof = {'passed': len(results), 'realModels': True, 'automaticPreAIStage': True, 'results': results, 'sourceSha256': source_hashes, 'modelProvenance': provenance, 'pageErrors': errors, 'apiCalls': api, 'unexpectedRequests': unexpected, 'blockedLibraryTelemetry': blocked_telemetry}
    (OUT / 'results.json').write_text(json.dumps(proof, indent=2) + '\n')
    print(json.dumps({'passed': len(results), 'automaticPreAIStage': True, 'apiCalls': 0, 'pageErrors': 0}))

# Display-size comparison only; the tested native PNGs above remain available.
from PIL import Image, ImageDraw
comparison = Image.new('RGB', (1080, 1080), '#eef0f6')
draw = ImageDraw.Draw(comparison)
for row in range(3):
    label = 'Synthetic fine-line fixture' if row == 2 else 'Public app portrait'
    for col, stage in enumerate(['before', 'base', 'after']):
        draw.text((col*360+10, row*360+8), f'{row+1} {label} / {stage}', fill='#222233')
        source = Image.open(OUT/f'{row+1}-{stage}.png').convert('RGB')
        source.thumbnail((340, 325))
        comparison.paste(source, (col*360+(360-source.width)//2, row*360+30))
comparison.save(OUT/'comparison.jpg', quality=87)
region = results[-1]['syntheticRegion']
box = (region['left']-8, region['top']-12, region['right']+8, region['bottom']+12)
patch = Image.new('RGB', (1110, 180), '#eef0f6')
patch_draw = ImageDraw.Draw(patch)
for col, stage in enumerate(['before', 'base', 'after']):
    patch_draw.text((col*370+8, 8), 'Synthetic fine-line fixture / '+stage, fill='#222233')
    crop = Image.open(OUT/f'3-{stage}.png').convert('RGB').crop(box)
    crop.resize((crop.width*3, crop.height*3), Image.Resampling.NEAREST).save(OUT/f'3-{stage}-crop.png')
    crop = crop.resize((crop.width*3, crop.height*3), Image.Resampling.NEAREST)
    patch.paste(crop, (col*370+2, 30))
patch.save(OUT/'synthetic-fine-line-comparison.jpg', quality=92)
