"""Inject a connected black board-end remnant into an actual portrait; no AI."""
import os,json
from playwright.sync_api import sync_playwright
base=os.environ.get('REAL_DETAILS_BASE','http://127.0.0.1:5204')
with sync_playwright()as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();page.goto(base+'/scripts/fixtures/government-result-insignia.html',wait_until='networkidle')
 result=page.evaluate('''async()=>{
 const {detectUniformDetails}=await import('/src/real-uniform-details.js'),{prepareRealUniformDetails}=await import('/src/real-uniform-details-browser.js');
 const im=new Image();im.src='/assets/government-uniforms/female-operational-example.jpg';await im.decode();const c=Object.assign(document.createElement('canvas'),{width:640,height:Math.round(im.height*640/im.width)}),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,c.width,c.height);
 const g=detectUniformDetails(ctx.getImageData(0,0,c.width,c.height)).boards[0],v=g.h*.25,u=g.w/2+g.h*.12,px=Math.round(g.cx+u*Math.cos(g.angle)-v*Math.sin(g.angle)),py=Math.round(g.cy+u*Math.sin(g.angle)+v*Math.cos(g.angle));
 ctx.save();ctx.translate(g.cx,g.cy);ctx.rotate(g.angle);ctx.strokeStyle='#202020';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(g.w/2-4,v);ctx.lineTo(g.w/2+g.h*.35,v);ctx.stroke();ctx.restore();
 const before=[...ctx.getImageData(px,py,1,1).data];if(Math.max(...before.slice(0,3))>50)throw Error('Fixture missed remnant');
 const result=await prepareRealUniformDetails({originalSource:c,templatePath:'/assets/government-uniforms/female-operational.png'});if(!result)throw Error('Detection unavailable');const out=new Image();out.src=result.cleanedSource;await out.decode();ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(out,0,0);const after=[...ctx.getImageData(px,py,1,1).data];if(after[3]>=190&&Math.max(...after.slice(0,3))<=125)throw Error('Black remnant survived cleanup');return {before,after,parts:result.parts.length,aiCalls:0};
 }''');print(json.dumps(result));b.close()
