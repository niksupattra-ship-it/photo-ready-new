"""Compare prebuilt starter placement to the unchanged native-browser fallback."""
import asyncio,json,pathlib,os
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
BASE=os.environ.get('EASY_PICKER_BASE','http://127.0.0.1:5173')
main=(ROOT/'src/main.jsx').read_text()
alpha=main[main.index('async function alphaBounds(img)'):main.index('async function composePortrait(')]
start=main.index('const ub=await alphaBounds(uniform),W=bg.naturalWidth,H=bg.naturalHeight;')
reference=main[start:main.index('const background=canvasFor(bg.naturalWidth',start)]
catalog=json.loads((ROOT/'src/studio-starters.json').read_text())
templates=[next(path for path in catalog['uniforms'] if '/'+kind+'-uniforms/'in path)for kind in ['job','government','student','gown']]

async def run():
 results=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page();await page.goto(BASE+'/scripts/fixtures/easy-picker-previews.html')
  for template in templates:
   for background in catalog['backgrounds']:
    result=await page.evaluate('''async({template,background,alpha,reference})=>{
     const {studioStarterPlan}=await import('/src/studio-starter.js');
     const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
     const measure=new AsyncFunction('starterTemplate','backgroundSource',alpha+`
      const canvasFor=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
      const load=source=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=source});
      const [uniform,bg]=await Promise.all([load(starterTemplate),load(backgroundSource)]);
      `+reference+';return placement;');
     const expected=await measure(template,background);
     const actual=studioStarterPlan(template,{src:background,id:'fixture'}).placement;
     return {expected,actual};
    }''',{'template':template,'background':background,'alpha':alpha,'reference':reference})
    differences={key:abs(result['actual'][key]-result['expected'][key])for key in ['uX','uY','uW','uH']}
    assert result['actual']['W']==result['expected']['W'] and result['actual']['H']==result['expected']['H']
    assert result['actual']['templatePath']==result['expected']['templatePath']
    assert max(differences.values())<.1,(result,differences)
    results.append({'template':template,'background':background,'nativePlacementDifferences':differences})
  await browser.close()
 print(json.dumps(results))

asyncio.run(run())
