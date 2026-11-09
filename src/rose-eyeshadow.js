const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const lids=[[33,246,161,160,159,158,157,173,133],[263,466,388,387,386,385,384,398,362]];
const brows=[[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]];

// Eye-local coordinates follow the photographed lid, including tilted eyes.
// The brow bounds the upward fade; no image or feature geometry is changed.
export function roseEyeModel(face,width,height,side){
 const point=id=>({x:face[id].x*width,y:face[id].y*height});
 const points=lids[side].map(point),a=points[0],b=points.at(-1),span=Math.hypot(b.x-a.x,b.y-a.y);
 const left=point(33),right=point(263),d=Math.hypot(right.x-left.x,right.y-left.y);
 if(!Number.isFinite(span)||span<1||!Number.isFinite(d)||d<24)throw Error('ตรวจแนวเปลือกตาไม่สำเร็จ');
 const ux=(b.x-a.x)/span,uy=(b.y-a.y)/span;
 let nx=-uy,ny=ux;const browPoints=brows[side].map(point),browCenter={x:median(browPoints.map(p=>p.x)),y:median(browPoints.map(p=>p.y))};
 if((browCenter.x-a.x)*nx+(browCenter.y-a.y)*ny<0){nx=-nx;ny=-ny}
 const project=p=>({u:((p.x-a.x)*ux+(p.y-a.y)*uy)/span,v:(p.x-a.x)*nx+(p.y-a.y)*ny});
 return {x:a.x,y:a.y,ux,uy,nx,ny,span,d,lid:points.map(project).sort((p,q)=>p.u-q.u),browV:median(browPoints.map(p=>project(p).v))};
}

export function roseEyeCoordinates(model,x,y){
 const {ux,uy,nx,ny,span,d,lid,browV}=model,dx=x-model.x,dy=y-model.y,u=(dx*ux+dy*uy)/span;
 let k=1;while(k<lid.length-1&&lid[k].u<u)k++;
 const a=lid[k-1],b=lid[k],t=clamp((u-a.u)/Math.max(.0001,b.u-a.u),0,1),lidV=a.v+(b.v-a.v)*t;
 const height=clamp((browV-lidV)*.68,d*.035,d*.14);
 return {u,v:(dx*nx+dy*ny-lidV)/height,height};
}

export function sampleRoseEyeshadow(model,x,y){
 const {u,v}=roseEyeCoordinates(model,x,y);
 if(u<=-.08||u>=1.08||v<=-.04||v>=1.12)return {pigment:0,pearl:0};
 const corners=smooth(-.08,.13,u)*(1-smooth(.87,1.08,u));
 const upward=smooth(-.04,.14,v)*(1-smooth(.48,1.12,v));
 const center=Math.exp(-2*((u-.5)/.24)**2);
 // Colour lives along the lid and outer socket. The central mobile lid is
 // deliberately less saturated so it reads as soft reflected light.
 const pigment=corners*upward*(.82+.18*(1-clamp(u,0,1)))*(1-.78*center);
 const pearl=corners*Math.exp(-2*(((u-.5)/.25)**2+((v-.30)/.30)**2))*smooth(-.04,.10,v);
 return {pigment,pearl};
}
