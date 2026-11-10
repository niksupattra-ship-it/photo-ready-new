const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function normalizeDownloadChoice(value={}){
 value=value&&typeof value==='object'?value:{};
 return {sizeId:typeof value.sizeId==='string'&&/^[a-zA-Z0-9.-]{1,40}$/.test(value.sizeId)?value.sizeId:'original',x:clamp(Number.isFinite(value.x)?value.x:.5,-.5,1.5),y:clamp(Number.isFinite(value.y)?value.y:.5,-.5,1.5),zoom:clamp(Number.isFinite(value.zoom)?value.zoom:1,.5,3),freePosition:true,format:value.format==='pdf'?'pdf':'png',copies:Number.isSafeInteger(value.copies)&&value.copies>0?Math.min(100,value.copies):null};
}
export function rememberDownloadChoice(choice,jobIds,{requested=false}={}){
 const ids=[...new Set(jobIds)];
 return ids.length&&ids.every(id=>typeof id==='string'&&id.length>0)?{version:1,jobIds:ids,choice:normalizeDownloadChoice(choice),requested:requested===true}:null;
}
export function downloadChoiceForJobs(record,jobIds){
 const ids=[...new Set(jobIds)];
 return record?.version===1&&Array.isArray(record.jobIds)&&record.jobIds.length===ids.length&&ids.every(id=>record.jobIds.includes(id))?normalizeDownloadChoice(record.choice):null;
}

// Draw only on the preview surface, after cropping, so repositioning the photo
// cannot move the watermark away. Authorized PNG/PDF source pixels stay clean.
export function drawDownloadWatermark(ctx,{x=0,y=0,width,height}){
 ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.translate(x+width/2,y+height/2);ctx.rotate(-.45);
 const font=Math.max(10,width*.13),reach=Math.hypot(width,height);
 ctx.font=`700 ${font}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(.6,font*.025);ctx.strokeStyle='rgba(25,35,60,.26)';ctx.fillStyle='rgba(255,255,255,.58)';
 for(let row=-reach;row<=reach;row+=font*2.7)for(let col=-reach;col<=reach;col+=font*6){ctx.strokeText('IDพร้อม',col,row);ctx.fillText('IDพร้อม',col,row)}
 ctx.restore();
}
