"""Automatic acne/wrinkle repair, fine skin texture and matte highlights.

Uses real MediaPipe evidence on an existing public application portrait. The
second fixture contains explicitly synthetic blemishes, lines and highlights;
these are neither customer skin nor a generated AI result. No provider/API work.
"""
import base64, hashlib, io, json, os, pathlib, urllib.request
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = os.environ.get('STUDIO_RETOUCH_BASE', 'http://127.0.0.1:5177')
OUT = pathlib.Path(os.environ.get('STUDIO_RETOUCH_OUTPUT', '/tmp/studio-skin-retouch-browser'))
OUT.mkdir(parents=True, exist_ok=True)
CACHE = pathlib.Path(os.environ.get('STUDIO_RETOUCH_MODEL_CACHE', '/tmp/idprom-mediapipe-model-cache'))
FACE = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
SEGMENT = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite'
WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/'
PACKAGE = ROOT / 'node_modules/@mediapipe/tasks-vision'
assert json.loads((PACKAGE / 'package.json').read_text())['version'] == '1.0.1'
models, provenance = {}, []
for url in [FACE, SEGMENT]:
    path = CACHE / url.rsplit('/', 1)[1]
    if path.is_file():
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
    errors, api, unexpected, telemetry = [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def route(request):
        url = request.request.url
        if '/api/' in url:
            api.append(url); request.abort()
        elif url.startswith('https://odml.pa.googleapis.com/v1/log'):
            telemetry.append(url); request.abort()
        elif url in models:
            request.fulfill(status=200, content_type='application/octet-stream', body=models[url])
        elif url.startswith(WASM):
            path = PACKAGE / 'wasm' / url.rsplit('/', 1)[1]
            assert path.is_file() and path.parent == PACKAGE / 'wasm'
            request.fulfill(status=200, content_type='application/wasm' if path.suffix == '.wasm' else 'application/javascript', body=path.read_bytes())
        elif url == BASE + '/tests/studio-skin-retouch.html':
            request.fulfill(status=200, content_type='text/html', body='<html><body>Automatic skin retouch checks</body></html>')
        elif url.startswith(BASE + '/'):
            request.continue_()
        else:
            unexpected.append(url); request.abort()

    page.route('**/*', route)
    page.goto(BASE + '/tests/studio-skin-retouch.html')
    page.evaluate('''async({faceUrl,segmentUrl,wasm})=>{
      const {loadVisionRuntime}=await import('/src/vision-runtime.js');
      const {FaceLandmarker,ImageSegmenter,FilesetResolver}=await loadVisionRuntime();
      const files=await FilesetResolver.forVisionTasks(wasm);
      window.retouchLandmarker=await FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:faceUrl},runningMode:'IMAGE',numFaces:1});
      window.retouchSegmenter=await ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:segmentUrl},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});
    }''', {'faceUrl': FACE, 'segmentUrl': SEGMENT, 'wasm': WASM})
    results, images = [], []
    for synthetic in [False, True]:
        result = page.evaluate('''async({synthetic,debug})=>{
          const {captureStudioSkinEvidence}=await import('/src/studio-skin-evidence.js');
          const {applyStudioSkinBase,STUDIO_SKIN_WORKFLOW_VERSION}=await import('/studio-skin-treatment.js');
          const {applyStudioSkinSoftFocus}=await import('/studio-skin-soft-focus.js');
          const {applyStudioSkinRetouch}=await import('/studio-skin-retouch.js');
          const {LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
          const decode=async blob=>{const url=URL.createObjectURL(blob),im=new Image();try{im.src=url;await im.decode();return im}finally{URL.revokeObjectURL(url)}};
          const source='/assets/face-finish/natural.webp';let blob=await(await fetch(source)).blob(),image=await decode(blob);
          const W=image.naturalWidth,H=image.naturalHeight,c=Object.assign(document.createElement('canvas'),{width:W,height:H}),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
          const clean=ctx.getImageData(0,0,W,H).data.slice(),dirty=new Uint8ClampedArray(clean),face=retouchLandmarker.detect(image).faceLandmarks[0];
          const p=id=>({x:face[id].x*W,y:face[id].y*H}),left=p(234),right=p(454),fw=Math.hypot(right.x-left.x,right.y-left.y),cx=(left.x+right.x)/2,top=p(10).y,brow=Math.min(p(105).y,p(334).y),foreY=top+(brow-top)*.52;
          const acne=[{x:p(50).x,y:p(50).y,r:Math.max(2.2,fw*.011)},{x:p(280).x,y:p(280).y,r:Math.max(2.2,fw*.012)},{x:cx-fw*.18,y:foreY-fw*.03,r:Math.max(2,fw*.010)}];
          const lines=[{name:'forehead',cx,cy:foreY,rx:fw*.17,amp:22},{name:'underEye',cx:(p(33).x+p(133).x)/2,cy:p(145).y+fw*.045,rx:fw*.070,amp:18}];
          const highlight={x:cx+fw*.19,y:foreY-fw*.040,rx:fw*.034,ry:fw*.030};
          const mutate=(x,y,fn)=>{if(x<0||y<0||x>=W||y>=H)return;const k=(y*W+x)*4;fn(k)};
          if(synthetic){
            for(const q of acne)for(let y=Math.floor(q.y-q.r*2);y<=q.y+q.r*2;y++)for(let x=Math.floor(q.x-q.r*2);x<=q.x+q.r*2;x++){
              const d=((x-q.x)/q.r)**2+((y-q.y)/q.r)**2,a=Math.exp(-2*d);mutate(x,y,k=>{dirty[k]+=14*a;dirty[k+1]-=25*a;dirty[k+2]-=22*a});
            }
            for(const q of lines)for(let x=Math.floor(q.cx-q.rx);x<=q.cx+q.rx;x++){
              const envelope=Math.cos((x-q.cx)/q.rx*Math.PI/2)**2,cy=q.cy+Math.sin((x-q.cx)/fw*8)*.6;
              for(let y=Math.floor(cy-3);y<=cy+3;y++){const a=q.amp*Math.exp(-Math.pow((y-cy)/.8,2))*envelope;mutate(x,y,k=>{for(let t=0;t<3;t++)dirty[k+t]-=a})}
            }
            const q=highlight;for(let y=Math.floor(q.y-q.ry*2);y<=q.y+q.ry*2;y++)for(let x=Math.floor(q.x-q.rx*2);x<=q.x+q.rx*2;x++){
              const a=Math.exp(-2*(((x-q.x)/q.rx)**2+((y-q.y)/q.ry)**2));mutate(x,y,k=>{for(let t=0;t<3;t++)dirty[k+t]=dirty[k+t]*(1-a)+[252,250,247][t]*a});
            }
            ctx.putImageData(new ImageData(dirty,W,H),0,0);blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));image=await decode(blob);
          }
          const evidence=await captureStudioSkinEvidence(blob,{decode,landmarker:retouchLandmarker,segmenter:retouchSegmenter,signal:{get aborted(){return false}}});
          const original=synthetic?dirty:clean,originalCopy=original.slice(),base=applyStudioSkinBase({pixels:original,width:W,height:H,evidence}),soft=applyStudioSkinSoftFocus({pixels:base.pixels,width:W,height:H,evidence}),softCopy=soft.pixels.slice();
          const begun=performance.now(),retouch=applyStudioSkinRetouch({pixels:soft.pixels,width:W,height:H,evidence}),elapsedMs=performance.now()-begun;
          if(!retouch?.pixels||retouch.pixels.length!==W*H*4)throw Error('Invalid native retouch output');
          let outsideMismatch=0,alphaMismatch=0,featureMismatch=0,inputMismatch=0,changed=0;
          const labelAt=(x,y)=>evidence.labels[Math.min(evidence.maskHeight-1,Math.floor(y*evidence.maskHeight/H))*evidence.maskWidth+Math.min(evidence.maskWidth-1,Math.floor(x*evidence.maskWidth/W))];
          const featureSurface=Object.assign(document.createElement('canvas'),{width:W,height:H}),fx=featureSurface.getContext('2d');fx.fillStyle='#fff';
          const featurePolys=[...C.eyes,...C.brows,C.lips].map(ids=>ids.map(id=>({x:evidence.face[id][0]*W,y:evidence.face[id][1]*H})));
          for(const poly of featurePolys){fx.beginPath();poly.forEach((p,j)=>j?fx.lineTo(p.x,p.y):fx.moveTo(p.x,p.y));fx.closePath();fx.fill()}
          const featureBits=fx.getImageData(0,0,W,H).data,guardRadius=Math.max(1,Math.min(8,Math.round(fw*.004)));
          for(let y=0;y<H;y++)for(let x=0;x<W;x++){
            const k=(y*W+x)*4,label=labelAt(x,y);if(retouch.pixels[k+3]!==softCopy[k+3])alphaMismatch++;
            let different=false;for(let t=0;t<4;t++){
              if(original[k+t]!==originalCopy[k+t]||soft.pixels[k+t]!==softCopy[k+t])inputMismatch++;
              if(label!==2&&label!==3&&retouch.pixels[k+t]!==softCopy[k+t])outsideMismatch++;
              if(featureBits[k+3]>250&&retouch.pixels[k+t]!==softCopy[k+t])featureMismatch++;
              if(t<3&&retouch.pixels[k+t]!==softCopy[k+t])different=true;
            }if(different)changed++;
          }
          for(const id of [33,263,70,300,61,291,98,327]){
            const q=evidence.face[id],k=(Math.max(0,Math.min(H-1,Math.floor(q[1]*H)))*W+Math.max(0,Math.min(W-1,Math.floor(q[0]*W))))*4;
            for(let t=0;t<4;t++)if(retouch.pixels[k+t]!==softCopy[k+t])featureMismatch++;
          }
          const Y=(pix,x,y)=>{const k=(Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x))))*4;return pix[k]*.2126+pix[k+1]*.7152+pix[k+2]*.0722};
          let metrics=null;
          if(synthetic){
            const refBase=applyStudioSkinBase({pixels:clean,width:W,height:H,evidence}),refSoft=applyStudioSkinSoftFocus({pixels:refBase.pixels,width:W,height:H,evidence}),reference=applyStudioSkinRetouch({pixels:refSoft.pixels,width:W,height:H,evidence}).pixels;
            const region=(q,r,fn)=>{let sum=0,count=0;for(let y=Math.floor(q.y-r);y<=q.y+r;y++)for(let x=Math.floor(q.x-r);x<=q.x+r;x++)if((x-q.x)**2+(y-q.y)**2<=r*r){sum+=fn(x,y);count++}return count?sum/count:0};
            const red=(pix,x,y)=>{const k=(Math.round(y)*W+Math.round(x))*4;return pix[k]-pix[k+1]};
            const acneMetrics=acne.map(q=>{
              const before=region(q,q.r*.65,(x,y)=>Math.max(0,red(softCopy,x,y)-red(refSoft.pixels,x,y))),after=region(q,q.r*.65,(x,y)=>Math.max(0,red(retouch.pixels,x,y)-red(reference,x,y)));
              const textureRms=Math.sqrt(region(q,Math.max(2,q.r*.65),(x,y)=>{const local=(Y(retouch.pixels,x-2,y)+Y(retouch.pixels,x+2,y)+Y(retouch.pixels,x,y-2)+Y(retouch.pixels,x,y+2))*.25;return Math.pow(Y(retouch.pixels,x,y)-local,2)}));
              return{before,after,retainedRatio:before?after/before:0,textureRms};
            });
            const distance=(x,y,poly)=>{let d=Infinity;for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));d=Math.min(d,Math.hypot(x-a.x-dx*t,y-a.y-dy*t))}return d};
            const wrinkleMetrics=lines.map(q=>{
              const error=(pix,ref)=>{let s=0,n=0;for(let x=Math.round(q.cx-q.rx*.55);x<=q.cx+q.rx*.55;x++){const y=q.cy+Math.sin((x-q.cx)/fw*8)*.6;s+=Math.max(0,Y(ref,x,y)-Y(pix,x,y));n++}return s/n};
              let protectedSamples=0,nonSkinSamples=0,samples=0,minFeatureDistance=Infinity;
              for(let x=Math.round(q.cx-q.rx*.55);x<=q.cx+q.rx*.55;x++){const y=Math.round(q.cy+Math.sin((x-q.cx)/fw*8)*.6);let guarded=false;for(let yy=y-guardRadius;yy<=y+guardRadius;yy++)for(let xx=x-guardRadius;xx<=x+guardRadius;xx++)if(xx>=0&&yy>=0&&xx<W&&yy<H&&featureBits[(yy*W+xx)*4+3])guarded=true;if(guarded)protectedSamples++;if(![2,3].includes(labelAt(x,y)))nonSkinSamples++;samples++;for(const poly of featurePolys)minFeatureDistance=Math.min(minFeatureDistance,distance(x+.5,y+.5,poly))}
              const before=error(softCopy,refSoft.pixels),after=error(retouch.pixels,reference);return{name:q.name,before,after,retainedRatio:before?after/before:0,samples,independentFeatureGuardSamples:protectedSamples,nonSkinSamples,minFeatureDistancePixels:minFeatureDistance,guardRadius};
            });
            const q=highlight,before=region(q,q.rx*.40,(x,y)=>Y(softCopy,x,y)),after=region(q,q.rx*.40,(x,y)=>Y(retouch.pixels,x,y)),referenceBefore=region(q,q.rx*.40,(x,y)=>Y(refSoft.pixels,x,y)),referenceAfter=region(q,q.rx*.40,(x,y)=>Y(reference,x,y));
            const texture=q=>{const residuals=[];for(let y=Math.round(q.y+fw*.055);y<q.y+fw*.10;y++)for(let x=Math.round(q.x-fw*.045);x<q.x+fw*.045;x++){const m=(Y(retouch.pixels,x-2,y)+Y(retouch.pixels,x+2,y)+Y(retouch.pixels,x,y-2)+Y(retouch.pixels,x,y+2))*.25;residuals.push(Y(retouch.pixels,x,y)-m)}return Math.sqrt(residuals.reduce((s,v)=>s+v*v,0)/residuals.length)};
            metrics={acne:acneMetrics,wrinkles:wrinkleMetrics,highlight:{before,after,excessBefore:before-referenceBefore,excessAfter:after-referenceAfter,retainedExcessRatio:(after-referenceAfter)/(before-referenceBefore)},fineTextureRms:texture(acne[0])};
          }
          const jpeg=pix=>{ctx.putImageData(new ImageData(new Uint8ClampedArray(pix),W,H),0,0);return c.toDataURL('image/jpeg',.86)};
          const debugData=debug&&synthetic?(()=>{ctx.putImageData(new ImageData(softCopy,W,H),0,0);return{debugEvidence:evidence,debugSoftPNG:c.toDataURL('image/png')}})():{};
          return{source,syntheticDefects:synthetic,width:W,height:H,version:STUDIO_SKIN_WORKFLOW_VERSION,faceLandmarks:evidence.face.length,evidenceMask:[evidence.maskWidth,evidence.maskHeight],injection:synthetic?{acne,lines,highlight,faceWidth:fw}:null,metrics,baseReport:base.report,softReport:soft.report,retouchReport:retouch.report,elapsedMs,changedPixels:changed,outsideMismatch,alphaMismatch,featureMismatch,inputMismatch,...debugData,before:jpeg(originalCopy),soft:jpeg(softCopy),after:jpeg(retouch.pixels)};
        }''', {'synthetic': synthetic, 'debug': os.environ.get('STUDIO_RETOUCH_DEBUG') == '1'})
        if 'debugEvidence' in result:
            (OUT/'debug-evidence.json').write_text(json.dumps(result.pop('debugEvidence'))+'\n')
            (OUT/'debug-soft.png').write_bytes(base64.b64decode(result.pop('debugSoftPNG').split(',',1)[1]))
        display = {}
        for stage in ['before', 'soft', 'after']:
            display[stage] = Image.open(io.BytesIO(base64.b64decode(result.pop(stage).split(',', 1)[1]))).convert('RGB')
        images.append(display)
        (OUT / ('probe-synthetic.json' if synthetic else 'probe-public.json')).write_text(json.dumps(result, indent=2)+'\n')
        assert result['version'] == 'studio-skin-stages-v3', result
        assert result['faceLandmarks'] in [468, 478], result
        assert all(result[key] == 0 for key in ['outsideMismatch', 'alphaMismatch', 'featureMismatch', 'inputMismatch']), result
        assert result['changedPixels'] > 64, result
        assert result['elapsedMs'] < 10000, result
        if synthetic:
            assert min(m['before'] for m in result['metrics']['acne']) > 8, result
            assert max(m['retainedRatio'] for m in result['metrics']['acne']) < .25, result
            assert min(m['before'] for m in result['metrics']['wrinkles']) > 2, result
            assert all(m['independentFeatureGuardSamples'] == 0 and m['nonSkinSamples'] == 0 for m in result['metrics']['wrinkles']), result
            assert max(m['retainedRatio'] for m in result['metrics']['wrinkles']) < .25, result
            assert result['metrics']['highlight']['before'] > 230, result
            assert result['metrics']['highlight']['after'] < 235, result
            assert result['metrics']['highlight']['retainedExcessRatio'] < .65, result
            assert .05 < result['metrics']['fineTextureRms'] < 5, result
            assert all(.25 < m['textureRms']/result['metrics']['fineTextureRms'] < 3 for m in result['metrics']['acne']), result
        results.append(result)
        print(json.dumps(result), flush=True)
    page.evaluate('()=>{retouchLandmarker.close();retouchSegmenter.close()}')
    browser.close()
    assert not errors, errors
    assert not api, api
    assert not unexpected, unexpected

comparison = Image.new('RGB', (1050, 780), '#eef0f6')
draw = ImageDraw.Draw(comparison)
for row, stages in enumerate(images):
    label = 'Synthetic acne / lines / highlight' if row else 'Existing public app portrait'
    for col, stage in enumerate(['before', 'soft', 'after']):
        draw.text((col*350+9, row*390+8), label+' / '+stage, fill='#222233')
        photo=stages[stage].copy();photo.thumbnail((330,350))
        comparison.paste(photo,(col*350+(350-photo.width)//2,row*390+30))
comparison.save(OUT/'comparison.jpg',quality=88)
q=results[-1]['injection']; regions=[('Forehead lines',(q['lines'][0]['cx']-q['lines'][0]['rx'],q['lines'][0]['cy']-7,q['lines'][0]['cx']+q['lines'][0]['rx'],q['lines'][0]['cy']+7)),('Under-eye lines',(q['lines'][1]['cx']-q['lines'][1]['rx'],q['lines'][1]['cy']-7,q['lines'][1]['cx']+q['lines'][1]['rx'],q['lines'][1]['cy']+7)),('Red acne',(q['acne'][0]['x']-10,q['acne'][0]['y']-10,q['acne'][0]['x']+10,q['acne'][0]['y']+10)),('Skin highlight',(q['highlight']['x']-15,q['highlight']['y']-15,q['highlight']['x']+15,q['highlight']['y']+15))]
detail=Image.new('RGB',(1050,160*len(regions)),'#eef0f6');dd=ImageDraw.Draw(detail)
for row,(name,box) in enumerate(regions):
    for col,stage in enumerate(['before','soft','after']):
        dd.text((col*350+8,row*160+5),'Synthetic '+name+' / '+stage,fill='#222233')
        crop=images[-1][stage].crop(tuple(round(v) for v in box));scale=min(320/crop.width,120/crop.height);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.NEAREST)
        detail.paste(crop,(col*350+8,row*160+28))
detail.save(OUT/'synthetic-defect-comparison.jpg',quality=91)
source_hashes={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest()for name in ['studio-skin-treatment.js','studio-skin-soft-focus.js','studio-skin-retouch.js','src/studio-skin-evidence.js']}
proof={'passed':len(results),'realModels':True,'automaticPreAIStage':True,'results':results,'sourceSha256':source_hashes,'modelProvenance':provenance,'pageErrors':errors,'apiCalls':api,'unexpectedRequests':unexpected,'blockedLibraryTelemetry':telemetry}
(OUT/'results.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'passed':len(results),'automaticPreAIStage':True,'apiCalls':0,'pageErrors':0}))
