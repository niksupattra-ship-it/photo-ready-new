// Import safety only. Never resize saved pixels, masks or their placement.
export const PROJECT_IMAGE_MAX_PIXELS=8_000_000;
export const PROJECT_UNIQUE_MAX_PIXELS=40_000_000;
export const PROJECT_RESIDENT_MAX_BYTES=320*1024*1024;
const MAX_HEADER_BYTES=1024*1024;
const fields=['source','processedOriginalSource','hairOriginalSource','makeupBaseSource','makeupFullSource','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'];
const unsafe=()=>Object.assign(Error('ไฟล์งานนี้มีภาพหรือเลเยอร์ใหญ่เกินขีดจำกัดที่เปิดได้อย่างปลอดภัย งานปัจจุบันยังอยู่ กรุณาเก็บไฟล์งานเดิมไว้และติดต่อผู้ดูแลเพื่อลดขนาดงาน'),{code:'PROJECT_RESOURCE_LIMIT'});
const be16=(b,o)=>(b[o]<<8)|b[o+1];
const be32=(b,o)=>b[o]*16777216+b[o+1]*65536+b[o+2]*256+b[o+3];
const le32=(b,o)=>(b[o]+b[o+1]*256+b[o+2]*65536+b[o+3]*16777216)>>>0;
const ascii=(b,o,s)=>[...s].every((c,i)=>b[o+i]===c.charCodeAt(0));

// Read at most a bounded header, not a second full decoded copy of the data URL.
export function encodedImageSize(src){
 const match=/^data:image\/(png|jpeg|webp);base64,/.exec(src||'');if(!match)return null;
 const offset=match[0].length;let cached;
 const prefix=bytes=>{
  const count=Math.min(src.length-offset,Math.ceil(bytes/3)*4);
  if(cached&&cached.requested>=count)return cached.bytes;
  let part=src.slice(offset,offset+count).replace(/\s/g,'');
  if(offset+count<src.length)part=part.slice(0,part.length-part.length%4);
  try{const binary=atob(part),data=new Uint8Array(binary.length);for(let i=0;i<data.length;i++)data[i]=binary.charCodeAt(i);cached={requested:count,bytes:data};return data}catch{return new Uint8Array()}
 };
 let b=prefix(32);
 if(match[1]==='png')return b.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)&&ascii(b,12,'IHDR')?{width:be32(b,16),height:be32(b,20)}:null;
 if(match[1]==='jpeg'){
  if(b.length<4||be16(b,0)!==0xffd8)return null;
  let cursor=2;
  while(cursor<MAX_HEADER_BYTES){
   if(cursor+4>b.length)b=prefix(Math.min(MAX_HEADER_BYTES,Math.max(8192,b.length*2,cursor+4)));
   if(cursor+4>b.length||b[cursor]!==0xff)return null;
   while(b[cursor+1]===0xff)cursor++;
   const marker=b[cursor+1];cursor+=2;
   if(marker===0xd9||marker===0xda)return null;
   if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;
   if(cursor+2>b.length)return null;const length=be16(b,cursor);if(length<2)return null;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(cursor+7>b.length)b=prefix(cursor+7);
    return cursor+7<=b.length&&length>=7?{width:be16(b,cursor+5),height:be16(b,cursor+3)}:null;
   }
   cursor+=length;
  }
  return null;
 }
 if(b.length<20||!ascii(b,0,'RIFF')||!ascii(b,8,'WEBP'))return null;
 for(let cursor=12;cursor+8<=MAX_HEADER_BYTES;){
  if(cursor+30>b.length)b=prefix(Math.min(MAX_HEADER_BYTES,Math.max(8192,b.length*2,cursor+30)));
  if(cursor+8>b.length)return null;const length=le32(b,cursor+4),data=cursor+8;
  if(ascii(b,cursor,'VP8X'))return length>=10&&data+10<=b.length?{width:1+b[data+4]+b[data+5]*256+b[data+6]*65536,height:1+b[data+7]+b[data+8]*256+b[data+9]*65536}:null;
  if(ascii(b,cursor,'VP8L')){if(length<5||data+5>b.length||b[data]!==0x2f)return null;const bits=le32(b,data+1);return {width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)}}
  if(ascii(b,cursor,'VP8 '))return length>=10&&data+10<=b.length&&b[data+3]===0x9d&&b[data+4]===1&&b[data+5]===0x2a?{width:(b[data+6]|b[data+7]<<8)&0x3fff,height:(b[data+8]|b[data+9]<<8)&0x3fff}:null;
  if(length<1)return null;cursor+=8+length+(length&1);
 }
 return null;
}

function imageArea(size,collar=false){
 if(!size)return 0;const {width:w,height:h}=size;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1||w>(collar?16384:8192)||h>8192||w*h>PROJECT_IMAGE_MAX_PIXELS)throw unsafe();
 return w*h;
}
function surfaceSize(layer,size){
 if(!size)return null;
 if(!(layer.collarParts||layer.kind==='collar'||layer.name==='เข็มปกคอ')||layer.warpSource)return size;
 const f=layer.sourceFrame||{x:0,y:0,w:900,h:1200};
 if(f.x<=-128&&f.y<=-128&&f.x+f.w>=1028&&f.y+f.h>=1328)return size;
 const x=Math.min(-128,f.x),y=Math.min(-128,f.y),w=Math.max(1028,f.x+f.w)-x,h=Math.max(1328,f.y+f.h)-y,density=Math.min(2,size.width/f.w);
 return {width:Math.ceil(w*density),height:Math.ceil(h*density)};
}

export function createProjectResourceGuard(project){
 const entries=new Map();let encodedChars=0;
 const add=(src,collar=false)=>{if(!src)return;encodedChars+=src.length;const entry=entries.get(src);if(entry){entry.collar=entry.collar&&collar;return}entries.set(src,{size:encodedImageSize(src),collar})};
 for(const layer of project.layers){for(const key of fields)add(layer[key],Boolean(layer.collarParts));if(layer.collarParts){add(layer.collarParts.left,true);add(layer.collarParts.right,true)}
  // Finish references consume encoded and decoded memory, but no editable surface.
  add(layer.femaleFinishReference);
 }
 add(project.compareSource);
 const budget=()=>{
  let uniquePixels=0,mutablePixels=900*1200*2;
  for(const entry of entries.values())uniquePixels+=imageArea(entry.size,entry.collar);
  for(const layer of project.layers){
   const source=entries.get(layer.source)?.size,surface=surfaceSize(layer,source),area=imageArea(surface,Boolean(layer.collarParts)),drawArea=layer.warpSource?imageArea(entries.get(layer.warpSource)?.size,Boolean(layer.collarParts)):area;
   // Each layer has a draw buffer and mutable mask; saved warp/restore surfaces
   // also become their own canvases. Collar painting creates a composition.
   mutablePixels+=drawArea+(layer.sourceFrame?area:900*1200);
   if(layer.collarParts)mutablePixels+=area;
   else if(layer.kind==='collar'||layer.name==='เข็มปกคอ')mutablePixels+=area+imageArea(source,true)*2;
   for(const key of ['warpSource','eraseRestoreSource','warpRestoreBase'])if(layer[key])mutablePixels+=imageArea(entries.get(layer[key])?.size,Boolean(layer.collarParts));
  }
  const residentBytes=(uniquePixels+mutablePixels)*4+encodedChars*2;
  if(uniquePixels>PROJECT_UNIQUE_MAX_PIXELS||residentBytes>PROJECT_RESIDENT_MAX_BYTES)throw unsafe();
  return {uniquePixels,residentBytes,uniqueImages:entries.size};
 };
 budget();
 return {
  summary:budget,
  checkDecoded(src,width,height){
   const entry=entries.get(src);if(!entry)throw Error('ภาพในโปรเจกต์ไม่ถูกต้อง');
   imageArea({width,height},entry.collar);
   // JPEG orientation can swap axes, but must not conceal a different area.
   if(entry.size&&width*height!==entry.size.width*entry.size.height)throw Error('ขนาดภาพในไฟล์งานไม่ตรงกับข้อมูลภาพ');
   entry.size={width,height};return budget();
  }
 };
}
