"""Real garment images and browser fitting; face landmarks are a local fixture.
No AI provider, account, payment or email is contacted.
"""
import json,os,pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent;BASE=os.environ.get('SELECTION_BASE','http://127.0.0.1:5192')
with sync_playwright()as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);p=b.new_page();p.set_default_timeout(20000)
 p.route('**/*',lambda r:r.continue_()if r.request.url.startswith(BASE+'/')and'/api/'not in r.request.url else r.abort())
 p.goto(BASE+'/scripts/fixtures/selection-response.html',wait_until='domcontentloaded');p.wait_for_function('!!window.selectionSnapshot?.current')
 result=p.evaluate('''async()=>{
 const {fitStudioSuit}=await import('/src/studio-suit-fit.js'),{nativeAsset}=await import('/src/studio-source.js'),{warpStudioCollar}=await import('/src/studio-collar.js');
 const {default:source}=await import('/src/main.jsx?raw'),catalog=name=>Function(source.match(new RegExp('const '+name+'=\\\\[[\\\\s\\\\S]*?\\\\n\\\\];'))[0]+';return '+name)();
 const picks=[catalog('JOB_UNIFORMS')[0],catalog('INTERIOR_UNIFORMS')[0],catalog('FEMALE_GOVERNMENT_UNIFORMS')[0],catalog('GOWN_UNIFORMS')[0]];
 const portrait=document.createElement('canvas');portrait.width=900;portrait.height=1200;const x=portrait.getContext('2d');x.fillStyle='#d7a58a';x.beginPath();x.ellipse(450,390,162,220,0,0,Math.PI*2);x.fill();x.fillRect(380,580,140,180);
 const face=Array.from({length:470},()=>({x:.5,y:.34}));Object.assign(face,{10:{x:.5,y:.15},152:{x:.5,y:.52},234:{x:.32,y:.34},454:{x:.68,y:.34},33:{x:.4,y:.32},263:{x:.6,y:.32}});
 const head={id:'head',kind:'head',jobId:'fixture',source:portrait,x:21,y:11,scale:1.1,rotation:0,sourceFrame:{x:0,y:0,w:900,h:1200}},frame={x:0,y:350,w:900,h:900},results=[];
 for(const option of picks){
  const template=option.template||option.img,native=await nativeAsset('suit',{template},frame,null),before=native.source.toDataURL();
  const suit={id:'suit',kind:'suit',source:native.source,sourceFrame:frame,collarFrame:frame,templatePath:template,x:0,y:0,scale:1,rotation:0,neckWidth:33,neckHeight:9,autoCollarFitApplied:true};
  const layers=await fitStudioSuit({layers:[head,suit],previousSuit:suit,nextSuit:suit,headSource:portrait,measureFace:async()=>face});
  const garment=layers.find(l=>l.id==='suit'),fitted=layers.find(l=>l.id==='head');
  if(garment.neckWidth!==0||garment.neckHeight!==0||garment.autoCollarFitApplied)throw Error('Automatic collar deformation remains');
  if(garment.source!==native.source||garment.source.toDataURL()!==before)throw Error('Pattern pixels changed');
  if(garment.sourceFrame!==frame||garment.collarFrame!==frame||garment.scale!==1||garment.x!==0||garment.y!==0||garment.rotation!==0)throw Error('Pattern geometry changed');
  if(warpStudioCollar(garment.source,garment.neckWidth,garment.neckHeight,frame)!==garment.source)throw Error('Pattern would still be warped during paint');
  if(fitted.source!==portrait||fitted.jobId!==head.jobId||!Number.isFinite(fitted.scale)||fitted.scale===head.scale)throw Error('Head-only placement failed');
  results.push({template,originalPatternPixels:true,originalGarmentPose:true,automaticCollar:false,headOnly:true});
 }
 return results;
}''')
 print(json.dumps(result));out=ROOT/'work/head-only-fit';out.mkdir(parents=True,exist_ok=True);(out/'browser-results.json').write_text(json.dumps(result,indent=2));b.close()
