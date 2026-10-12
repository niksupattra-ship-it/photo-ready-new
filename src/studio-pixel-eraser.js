const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{const t=clamp(n,0,1);return t*t*(3-2*t)};

// Walk by distance, carrying the unfinished step across input events. Input
// frequency changes neither the number of dabs nor the strength of a stroke.
export function strokeSampler(spacing,emit,stabilize=0){
 if(!Number.isFinite(spacing)||spacing<=0||typeof emit!=='function')throw Error('ระยะรอยยางลบไม่ถูกต้อง');
 let last=null,dab=null,filtered=null,carry=0;
 const stamp=p=>{const amount=clamp(stabilize,0,1)*.35;filtered=filtered?{x:p.x*(1-amount)+filtered.x*amount,y:p.y*(1-amount)+filtered.y*amount}:{...p};emit(filtered);dab={...p}};
 return {add(p){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
  if(!last){last={...p};stamp(p);return}
  const dx=p.x-last.x,dy=p.y-last.y,dist=Math.hypot(dx,dy);
  if(dist){let at=spacing-carry;while(at<=dist+1e-7){stamp({x:last.x+dx*at/dist,y:last.y+dy*at/dist});at+=spacing}carry=dist-(at-spacing)}last={...p};
 },finish(p){if(p)this.add(p);if(last&&(!dab||Math.hypot(last.x-dab.x,last.y-dab.y)>.001||Math.hypot(last.x-filtered.x,last.y-filtered.y)>.001))emit({...last})}};
}

// Edit actual layer RGBA in small tiles. Temporary coverage only controls one
// stroke's saturation; it is never a project mask or a new image layer.
export function pixelEraserStroke(surface,reference,{radius,radiusY=radius,softness=30,opacity=1,restore=false,stabilize=0}={}){
 if(!surface||!reference||surface.width!==reference.width||surface.height!==reference.height||!Number.isFinite(radius)||radius<=0||!Number.isFinite(radiusY)||radiusY<=0)throw Error('ข้อมูลยางลบไม่ตรงกับเลเยอร์');
 const ctx=surface.getContext('2d',{willReadFrequently:true}),rc=reference.getContext('2d',{willReadFrequently:true}),size=64,tiles=new Map(),pending=new Set(),strength=clamp(opacity,0,1),hard=clamp(1-softness/100,0,.999);
 let region=null;
 const dab=p=>{
  if(!strength)return;
  const left=Math.max(0,Math.floor(p.x-radius)),top=Math.max(0,Math.floor(p.y-radiusY)),right=Math.min(surface.width,Math.ceil(p.x+radius)),bottom=Math.min(surface.height,Math.ceil(p.y+radiusY));
  for(let ty=Math.floor(top/size);ty<Math.ceil(bottom/size);ty++)for(let tx=Math.floor(left/size);tx<Math.ceil(right/size);tx++){
   const key=tx+','+ty;let tile=tiles.get(key);
   if(!tile){const x=tx*size,y=ty*size,w=Math.min(size,surface.width-x),h=Math.min(size,surface.height-y),image=ctx.getImageData(x,y,w,h);tile={x,y,w,h,image,before:new Uint8ClampedArray(image.data),reference:restore?rc.getImageData(x,y,w,h).data:null,coverage:new Float32Array(w*h)};tiles.set(key,tile)}
   let changed=false;
   for(let y=Math.max(top,tile.y);y<Math.min(bottom,tile.y+tile.h);y++)for(let x=Math.max(left,tile.x);x<Math.min(right,tile.x+tile.w);x++){
    const d=radiusY===radius?Math.hypot(x+.5-p.x,y+.5-p.y)/radius:Math.hypot((x+.5-p.x)/radius,(y+.5-p.y)/radiusY);if(d>=1)continue;
    const coverage=d<=hard?1:1-smooth((d-hard)/(1-hard)),n=(y-tile.y)*tile.w+x-tile.x;
    if(coverage<=tile.coverage[n])continue;tile.coverage[n]=coverage;
    const amount=strength*coverage,j=n*4,b=tile.before,out=tile.image.data;
    if(!restore)out[j+3]=Math.round(b[j+3]*(1-amount));
    else{const r=tile.reference,ba=b[j+3]*(1-amount),ra=r[j+3]*amount,a=ba+ra;for(let k=0;k<3;k++)out[j+k]=a?Math.round((b[j+k]*ba+r[j+k]*ra)/a):b[j+k];out[j+3]=Math.round(a)}
    changed=true;
   }
   if(changed)pending.add(tile);
  }
 };
 const sampler=strokeSampler(Math.max(.5,Math.min(radius,radiusY)*.12),dab,stabilize);
 return {add:p=>sampler.add(p),finish:p=>sampler.finish(p),flush(){
  region=null;for(const tile of pending){ctx.putImageData(tile.image,tile.x,tile.y);if(!region)region={x:tile.x,y:tile.y,w:tile.w,h:tile.h};else{const x=Math.min(region.x,tile.x),y=Math.min(region.y,tile.y);region={x,y,w:Math.max(region.x+region.w,tile.x+tile.w)-x,h:Math.max(region.y+region.h,tile.y+tile.h)-y}}}pending.clear();return region;
 }};
}

export function preparePixelSurface(a,l,copy){
 if(!a.eraseRestoreSource)a.eraseRestoreSource=copy(a.warped||a.original);
 l.eraseRestoreSource=a.eraseRestoreSource;
 if(!a.directPixelsReady){
  const editable=copy(a.warped||a.original),ctx=editable.getContext('2d');ctx.globalCompositeOperation='destination-in';ctx.drawImage(a.mask,0,0,editable.width,editable.height);ctx.globalCompositeOperation='source-over';
  if(a.warped)a.warped=editable;else{a.original=editable;l.source=editable;a.pixelSurfaceOwned=true}
  const m=a.mask.getContext('2d');m.clearRect(0,0,a.mask.width,a.mask.height);m.fillStyle='#fff';m.fillRect(0,0,a.mask.width,a.mask.height);a.directPixelsReady=true;a.dirty=true;a.dirtyRect=null;
 }else if(!a.warped&&!a.pixelSurfaceOwned){a.original=copy(a.original);l.source=a.original;a.pixelSurfaceOwned=true}
 return {surface:a.warped||a.original,reference:a.eraseRestoreSource};
}

export function brushSceneRegion(rect,layer,surface,display){
 const f=layer.sourceFrame||{x:0,y:0,w:900,h:1200},c=Math.cos(layer.rotation*Math.PI/180),s=Math.sin(layer.rotation*Math.PI/180);
 const points=[[rect.x-2,rect.y-2],[rect.x+rect.w+2,rect.y-2],[rect.x-2,rect.y+rect.h+2],[rect.x+rect.w+2,rect.y+rect.h+2]].map(([x,y])=>{const u=(f.x+x/surface.width*f.w-450)*(layer.squeezeX??1),v=(f.y+y/surface.height*f.h-600)*(layer.squeezeY??1);return {x:(450+layer.x+(u*c-v*s)*layer.scale)*display.width/900,y:(600+layer.y+(u*s+v*c)*layer.scale)*display.height/1200}});
 const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))),y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));return {x,y,w:Math.max(0,Math.min(display.width,Math.ceil(Math.max(...points.map(p=>p.x))))-x),h:Math.max(0,Math.min(display.height,Math.ceil(Math.max(...points.map(p=>p.y))))-y)};
}
