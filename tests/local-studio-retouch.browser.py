"""Real local skin worker and transferred buffers; synthetic portrait, no paid API."""
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parent.parent
source=(root/'scripts/check-female-makeup-soft-focus.mjs').read_text()
fixture=source[source.index('function fixture('):source.index('\nlet passed=')]
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 page.goto('http://127.0.0.1:5173/scripts/fixtures/easy-mode.html',wait_until='networkidle')
 requests=[]
 page.on('request',lambda request:requests.append(request.url) if '/api/' in request.url else None)
 result=page.evaluate('''async source=>{
  const {LOCAL_MAKEUP_CONTOURS:C}=await import('/src/local-makeup.js');
  const fixture=new Function('C',source+';return fixture')(C),f=fixture({width:1200}),before=f.pixels.slice();
  const worker=new Worker('/src/female-finish-worker.js',{type:'module'}),started=performance.now();
  let timer;
  const out=await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error('worker timeout')),15000);
   worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));
   worker.postMessage({kind:'makeup-soft-focus',studioRetouch:true,pixels:f.pixels,width:f.width,height:f.height,face:f.face,skin:f.skin,hair:f.hair},[f.pixels.buffer,f.skin.buffer,f.hair.buffer]);
  }).finally(()=>{clearTimeout(timer);worker.terminate()});
  if(!out.changed||out.report.version!=='female-local-studio-retouch-v2')throw Error('retouch skipped');
  let lift=0,n=0;
  for(let i=0;i<f.labels.length;i++){
   const k=i*4;
   if(out.pixels[k+3]!==before[k+3])throw Error('alpha changed');
   if(f.labels[i]>0&&f.labels[i]<9)for(let c=0;c<4;c++)if(out.pixels[k+c]!==before[k+c])throw Error('protected detail changed');
   if(f.labels[i]===9){lift+=out.pixels[k+1]-before[k+1];n++}
  }
  if(lift/n<4)throw Error('effect too weak');
  return {version:out.report.version,greenLift:lift/n,elapsedMs:Math.round(performance.now()-started)};
 }''',fixture)
 assert not requests,requests
 print('PASS full-resolution browser worker, skin brightening, protected features and zero API requests:',result)
 browser.close()
