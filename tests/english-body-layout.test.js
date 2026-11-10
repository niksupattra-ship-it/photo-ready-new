import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createEnglishBodyLayout} from '../english-body-layout.js';
const bounds=(pixels,width,colour)=>{
  const n=pixels.length/4,seen=new Uint8Array(n),queue=new Int32Array(n);let largest=null;
  const matches=i=>colour.every((v,c)=>pixels[i*4+c]===v);
  for(let seed=0;seed<n;seed++)if(!seen[seed]&&matches(seed)){
   let head=0,tail=1,left=width,right=-1,top=Infinity,bottom=-1;queue[0]=seed;seen[seed]=1;
   while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(j>=0&&j<n&&!seen[j]&&matches(j)){seen[j]=1;queue[tail++]=j}
   }
   if(!largest||tail>largest.count)largest={left,right,top,bottom,count:tail};
  }
  return largest;
 };
test('a deeper V changes chest coverage without lengthening the layout head or solid neck',async()=>{
 const make=async depth=>{
  const width=200,height=180,pixels=Buffer.alloc(width*height*4);
  for(let y=50;y<height;y++)for(let x=0;x<width;x++)if(!(x>=75&&x<125&&y<depth))pixels.set([50,60,80,255],(y*width+x)*4);
  return sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
 };

 const samples=[];
 for(const depth of [90,140]){
  const {data,info}=await sharp(await createEnglishBodyLayout(await make(depth))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,768);assert.equal(info.height,1024);
  const head= bounds(data,info.width,[170,178,189]),axis=(head.left+head.right)/2;
  const eyes=[[],[]];
  for(let i=0;i<data.length;i+=4)if(data[i]===105&&data[i+1]===117&&data[i+2]===133){const x=i/4%info.width,y=Math.floor(i/4/info.width);if(x<axis-20)eyes[0].push(y);else if(x>axis+20)eyes[1].push(y)}
  assert(eyes.every(e=>e.length>10),'the guide has two visible eye-level pose markers');
  const mean=e=>e.reduce((a,b)=>a+b,0)/e.length;
  assert(Math.abs(mean(eyes[0])-mean(eyes[1]))<.1,'eye markers remain horizontal');
  samples.push({head,neck:bounds(data,info.width,[146,155,168])});
 }
 assert(samples[0].head.count>1000);assert(samples[0].neck.count>100);
 assert.deepEqual(samples[0].head,samples[1].head,'V point must not move the head');
 for(const key of ['left','right','top','bottom'])assert(Math.abs(samples[0].neck[key]-samples[1].neck[key])<=2,'V point must not extend the reference neck');
});

test('smaller head guide keeps the same chin anchor, neck, garment pixels and canvas framing',async()=>{
 const outfit=await readFile(new URL('../public/assets/job-uniforms/female-job-tan-round-collar.png',import.meta.url));
 const decode=async image=>sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const before=await decode(await createEnglishBodyLayout(outfit,{headScale:1})),after=await decode(await createEnglishBodyLayout(outfit));
 assert.deepEqual(before.info,after.info);
 const a=bounds(before.data,before.info.width,[170,178,189]),b=bounds(after.data,after.info.width,[170,178,189]);
 assert(Math.abs((b.right-b.left)/(a.right-a.left)-.9)<.01,'whole head width reduced 10%');
 assert(Math.abs((b.bottom-b.top)/(a.bottom-a.top)-.9)<.01,'whole head height reduced 10%');
 assert(Math.abs(a.bottom-b.bottom)<=1,'chin stays anchored above the unchanged neck');
 const start=(Math.max(a.bottom,b.bottom)+2)*before.info.width*4;
 assert.deepEqual(after.data.subarray(start),before.data.subarray(start),'neck and entire garment below the jaw retain exact guide pixels');
});
