"""Authoring only: start npm run dev first; never submits an AI generation."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import json,base64,re
import argparse,subprocess
ROOT=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description='Extract hair masks from the actual catalogue picker images using the pinned local models.')
parser.add_argument('--base-url',default='http://127.0.0.1:5173')
parser.add_argument('--output-dir',default='/tmp/idprom-picker-guides')
args=parser.parse_args();out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)
rows=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {PRODUCTION_HAIR_CATALOG} from './hairstyle-catalog.js'; console.log(JSON.stringify(PRODUCTION_HAIR_CATALOG.map(h=>({...h,preview:h.src}))))"],cwd=ROOT,text=True))
base=args.base_url.rstrip('/')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page();page.route(re.compile(r'https://.*'),lambda r:r.abort());page.route('**/api/**',lambda r:r.abort());page.route(base+'/',lambda r:r.fulfill(status=200,content_type='text/html',body='<title>Catalogue hair audit</title>'))
 page.goto(base+'/')
 page.evaluate('''async()=>{const {loadVisionRuntime}=await import('/src/vision-runtime.js'),{VISION_WASM_ROOT,FACE_LANDMARK_MODEL,PERSON_SEGMENTATION_MODEL}=await import('/src/vision-assets.js'),{FilesetResolver,FaceLandmarker,ImageSegmenter}=await loadVisionRuntime(),vision=await FilesetResolver.forVisionTasks(VISION_WASM_ROOT);window.__catalogueModels={segmenter:await ImageSegmenter.createFromOptions(vision,{baseOptions:{modelAssetPath:PERSON_SEGMENTATION_MODEL},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:true}),face:await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:FACE_LANDMARK_MODEL},runningMode:'IMAGE',numFaces:1})}}''')
 reports=[]
 for row in rows:
  result=page.evaluate('''async item=>{
   const image=new Image();image.src=item.preview;await image.decode();const W=image.naturalWidth,H=image.naturalHeight,surface=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),source=surface(W,H),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const px=ctx.getImageData(0,0,W,H).data;
   const face=__catalogueModels.face.detect(image).faceLandmarks?.[0];if(!face)throw Error('No catalogue face '+item.id);
   const maskData=await new Promise(resolve=>__catalogueModels.segmenter.segment(image,result=>{const hair=result.confidenceMasks[1],skin=result.confidenceMasks[3],body=result.confidenceMasks[2],cloth=result.confidenceMasks[4];resolve({W:hair.width,H:hair.height,hair:Float32Array.from(hair.getAsFloat32Array()),skin:Float32Array.from(skin.getAsFloat32Array()),body:Float32Array.from(body.getAsFloat32Array()),cloth:Float32Array.from(cloth.getAsFloat32Array())})}));
   const sample=(data,x,y)=>{const sx=Math.max(0,Math.min(maskData.W-1,(x+.5)*maskData.W/W-.5)),sy=Math.max(0,Math.min(maskData.H-1,(y+.5)*maskData.H/H-.5)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(maskData.W-1,x0+1),y1=Math.min(maskData.H-1,y0+1),fx=sx-x0,fy=sy-y0;return (data[y0*maskData.W+x0]*(1-fx)+data[y0*maskData.W+x1]*fx)*(1-fy)+(data[y1*maskData.W+x0]*(1-fx)+data[y1*maskData.W+x1]*fx)*fy};
   const feature=surface(W,H),fc=feature.getContext('2d');fc.fillStyle='white';fc.strokeStyle='white';fc.lineWidth=3;
   for(const ids of [[33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],[263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],[61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146]]){fc.beginPath();ids.forEach((id,i)=>i?fc.lineTo(face[id].x*W,face[id].y*H):fc.moveTo(face[id].x*W,face[id].y*H));fc.closePath();fc.fill();fc.stroke()}
   const fp=fc.getImageData(0,0,W,H).data,N=W*H,confidence=new Float32Array(N),keep=new Uint8Array(N),distance=new Uint8Array(N),queue=new Uint32Array(N);let head=0,tail=0;
   const palette=new Map(),skinPalette=new Map();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,p=sample(maskData.hair,x,y),skin=sample(maskData.skin,x,y)+sample(maskData.body,x,y),color=[px[i*4],px[i*4+1],px[i*4+2]],key=color.map(v=>Math.floor(v/16)).join(',');if(p>.93)palette.set(key,color);if(skin>.93&&p<.02)skinPalette.set(key,color)}
   const nearest=(i,colors)=>{let best=Infinity;for(const c of colors.values()){const d=(px[i*4]-c[0])**2+(px[i*4+1]-c[1])**2+(px[i*4+2]-c[2])**2;if(d<best)best=d}return best},hairColour=i=>nearest(i,palette)<=nearest(i,skinPalette)*.85;
   const eyeTop=Math.min(...[33,263,159,386].map(id=>face[id].y*H))-W*.008,fringe=(x,y,p)=>y<eyeTop&&x>face[234].x*W&&x<face[454].x*W&&p>.12;
   const Y=i=>.2126*px[i*4]+.7152*px[i*4+1]+.0722*px[i*4+2],browY=Math.max(...[70,63,105,66,107,55,336,296,334,293,300,285].map(i=>face[i].y*H)),chinY=face[152].y*H;
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,p=sample(maskData.hair,x,y);confidence[i]=p;const detail=fp[i*4+3]>0&&p<.80;const centralBelow=y>browY+W*.015&&x>(face[234].x*W+W*.025)&&x<(face[454].x*W-W*.025);const skin=sample(maskData.skin,x,y)+sample(maskData.body,x,y);if(!detail&&(!centralBelow||p>.7)&&(p>.45&&p>skin&&(p>.85||hairColour(i))||fringe(x,y,p)&&Y(i)<155)){keep[i]=255;queue[tail++]=i}}
   while(head<tail){const i=queue[head++];if(distance[i]>=6)continue;const x=i%W,y=Math.floor(i/W);
    for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;const n=yy*W+xx,p=confidence[n];if(keep[n]||Y(n)>185||fp[n*4+3]>0&&p<.80||yy>browY+W*.015&&xx>face[234].x*W+W*.025&&xx<face[454].x*W-W*.025&&p<.7)continue;const contrast=Math.abs(px[i*4]-px[n*4])+Math.abs(px[i*4+1]-px[n*4+1])+Math.abs(px[i*4+2]-px[n*4+2]);if(contrast>75||p<.7&&!hairColour(n)&&!fringe(xx,yy,p)||p<.1&&(sample(maskData.skin,xx,yy)+sample(maskData.body,xx,yy))>.55)continue;keep[n]=255;distance[n]=distance[i]+1;queue[tail++]=n}
   }
   if(item.id==='seedream-20'){
    const eyeY=(face[33].y+face[263].y)*H/2,left=face[234].x*W,right=face[454].x*W,light=(x,y)=>Y(y*W+Math.max(0,Math.min(W-1,x)));
    let scan=0;const trace=new Uint32Array(N);let end=0;for(let i=0;i<N;i++)if(keep[i])trace[end++]=i;
    while(scan<end){const i=trace[scan++],x=i%W,y=Math.floor(i/W);for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1],[-2,0],[2,0],[0,2],[-1,2],[1,2],[-2,1],[2,1]]){const xx=x+dx,yy=y+dy;if(xx<6||xx>=W-6||yy<eyeY-W*.02||yy>chinY+W*.04||yy>=H)continue;const n=yy*W+xx;if(keep[n]||fp[n*4+3])continue;if(!((xx>left-W*.05&&xx<left+W*.07)||(xx>right-W*.07&&xx<right+W*.05)))continue;const value=Y(n);if(value>230||Math.min(light(xx-5,yy),light(xx+5,yy))-value<6)continue;keep[n]=255;trace[end++]=n}}
   }
   const mask=surface(W,H),mx=mask.getContext('2d'),frame=mx.createImageData(W,H);let pixels=0,minX=W,maxX=0,minY=H,maxY=0,features=0;
   for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!keep[i])continue;frame.data[i*4]=frame.data[i*4+1]=frame.data[i*4+2]=255;frame.data[i*4+3]=255;pixels++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(fp[i*4+3]>0)features++}
   mx.putImageData(frame,0,0);return {mask:mask.toDataURL('image/png'),width:W,height:H,pixels,bounds:{minX,maxX,minY,maxY},featureOverlap:features,face:face.map(p=>({x:p.x,y:p.y}))};
  }''',row)
  (out/(row['id']+'.png')).write_bytes(base64.b64decode(result.pop('mask').split(',')[1]));result['id']=row['id'];reports.append(result);print(json.dumps({k:v for k,v in result.items() if k!='face'}),flush=True)
 browser.close()
(out/'evidence.json').write_text(json.dumps(reports))
