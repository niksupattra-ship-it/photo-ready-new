// Grow only connected, similarly coloured native hair edges. This is a small
// evidence mask, never new hair pixels; opaque skin cannot be traversed.
export function expandPortraitHairProtection(pixels,hair,skin,width,height,radius=3){
 const N=width*height;if([pixels,hair,skin].some(p=>p.length!==N*4))throw Error('Invalid hair evidence');
 const keep=new Uint8Array(N),distance=new Uint8Array(N),queue=new Uint32Array(N);let head=0,tail=0;
 for(let i=0;i<N;i++)if(hair[i*4+3]>=192&&pixels[i*4+3]>16){keep[i]=255;queue[tail++]=i}
 while(head<tail){const i=queue[head++];if(distance[i]>=radius)continue;const x=i%width,y=Math.floor(i/width),j=i*4;
  for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
   const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;
   const n=ny*width+nx,k=n*4;if(keep[n]||pixels[k+3]<16||skin[k+3]>=128)continue;
   if(Math.abs(pixels[k]-pixels[j])+Math.abs(pixels[k+1]-pixels[j+1])+Math.abs(pixels[k+2]-pixels[j+2])>90)continue;
   keep[n]=255;distance[n]=distance[i]+1;queue[tail++]=n;
  }
 }
 return keep;
}
