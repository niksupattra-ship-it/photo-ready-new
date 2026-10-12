// The same affine coordinates are used by drawing, picking, brushes and export.
export const layerAxes=l=>({x:l.scale*(l.squeezeX??1),y:l.scale*(l.squeezeY??1)});
export function layerToScene(l,p){
 const a=layerAxes(l),r=l.rotation*Math.PI/180,u=(p.x-450)*a.x,v=(p.y-600)*a.y;
 return {x:450+l.x+u*Math.cos(r)-v*Math.sin(r),y:600+l.y+u*Math.sin(r)+v*Math.cos(r)};
}
export function sceneToLayer(l,p){
 const a=layerAxes(l),r=-l.rotation*Math.PI/180,u=p.x-450-l.x,v=p.y-600-l.y;
 return {x:450+(u*Math.cos(r)-v*Math.sin(r))/a.x,y:600+(u*Math.sin(r)+v*Math.cos(r))/a.y};
}
export function anchoredTransform(l,patch,anchor){
 const before=layerToScene(l,anchor),after=layerToScene({...l,...patch},anchor);
 return {...patch,x:l.x+before.x-after.x,y:l.y+before.y-after.y};
}
export function squeezeTransform(l,b,axis,value,side='center'){
 const key=axis==='x'?'squeezeX':'squeezeY',v=Math.max(.1,Math.min(3,value));
 const anchor={x:side==='left'?b.x+b.w:side==='right'?b.x:b.x+b.w/2,y:axis==='y'?b.y+b.h:b.y+b.h/2};
 return anchoredTransform(l,{[key]:v},anchor);
}
export function squeezePointer(l,b,axis,side,start,point){
 const a=sceneToLayer(l,start),p=sceneToLayer(l,point),size=axis==='x'?b.w:b.h;
 const amount=(p[axis]-a[axis])/Math.max(1,size)*(side==='right'?1:-1);
 return squeezeTransform(l,b,axis,(l[axis==='x'?'squeezeX':'squeezeY']??1)*(1+amount),side);
}
export function transformedOffset(from,to,p){
 return layerToScene(to,sceneToLayer(from,{x:450+p.x,y:600+p.y}));
}
