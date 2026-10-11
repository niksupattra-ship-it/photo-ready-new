import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const HAIR_FINISH_TONES=Object.freeze({
 'black-pro':'Rich professional black with restrained soft sheen, individual fine strands and natural tonal depth. Never oily, plastic, painted or uniformly solid black.',
 'black-natural':'Soft natural black, subtle dark-brown undertones only in lit strands, realistic strand variation and gentle low-gloss highlights. Never gray, flat, plastic or jet-black paint.'
});
export function hairFinishPrompt(tone){
 if(!HAIR_FINISH_TONES[tone])throw Error('เลือกสีดำโปรหรือสีดำธรรมชาติ');
 return `Refine ONLY the EXISTING HAIR in this already composed portrait. Preserve the exact current hairstyle silhouette, parting, fringe, length, thickness, root positions and placement. Do not restyle, add volume, add dangling wisps or grow hair onto ears/neck. ${HAIR_FINISH_TONES[tone]} Improve the existing hair's fine strand definition without oversharpening. Integrate hair-side roots and edges at forehead, ears and neck using subtle natural lighting and contact shading INSIDE existing hair, not broad blur. Keep the person identical: do not regenerate or modify face shape, forehead, eyebrows, eyes, nose, lips, skin, pores, ears, neck, clothing, accessories, background, pose or framing. Match existing photographic focus and light direction. Return the same full composition and aspect ratio. No text, watermark, border, halo or mask-like face overlay.`;
}
export async function hairOnlyOverlay(input,result,mask){
 const original=await sharp(input).metadata(),edited=await sharp(result,{limitInputPixels:33554432}).metadata();
 if(!original.width||!original.height||!edited.width||!edited.height||Math.abs((edited.width/edited.height)/(original.width/original.height)-1)>.015)throw Error('ผลสีผมมีสัดส่วนไม่ตรงกับงานเดิม');
 const W=original.width,H=original.height,m=await sharp(mask).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(m.info.width!==W||m.info.height!==H||m.info.channels!==4)throw Error('พื้นที่ผมไม่ตรงกับภาพ');
 const rgb=await sharp(result,{limitInputPixels:33554432}).resize(W,H,{fit:'fill',kernel:'lanczos3'}).toColourspace('srgb').removeAlpha().raw().toBuffer();
 const rgba=Buffer.alloc(W*H*4);let used=0;
 for(let i=0;i<W*H;i++){const j=i*4,a=m.data[j+3];if(a){rgba[j]=rgb[i*3];rgba[j+1]=rgb[i*3+1];rgba[j+2]=rgb[i*3+2];rgba[j+3]=a;used++}}
 if(used<16)throw Error('ยังไม่มีพื้นที่ผมสำหรับปรับ');
 return sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
}
export function registerHairFinishApi(app,{upload,fetchImpl=(...args)=>fetch(...args)}){
 const cache=new Map(),pending=new Map();let bytes=0;
 const prune=()=>{for(const [id,v] of cache)if(v.until<Date.now()){cache.delete(id);bytes-=v.png.length}while(cache.size>12||bytes>64*1024*1024){const id=cache.keys().next().value;bytes-=cache.get(id).png.length;cache.delete(id)}};
 // Separate optional operation, matching unlimited makeup; never reserves a
 // generation credit or alters daily trial/payment/portrait endpoints.
 app.post('/api/hair/finish',upload.fields([{name:'image',maxCount:1},{name:'mask',maxCount:1}]),async(req,res)=>{
  try{
   const input=req.files?.image?.[0]?.buffer,mask=req.files?.mask?.[0]?.buffer;
   if(!input||!mask)return res.status(400).json({message:'ไม่พบภาพหรือพื้นที่ผม'});
   let prompt;try{prompt=hairFinishPrompt(req.body?.tone)}catch(e){return res.status(400).json({message:e.message})}
   const meta=await sharp(input,{limitInputPixels:33554432}).metadata(),mm=await sharp(mask,{limitInputPixels:33554432}).metadata();
   if(!meta.width||!meta.height||meta.width*meta.height>33554432||meta.width!==mm.width||meta.height!==mm.height||!mm.hasAlpha)return res.status(400).json({message:'พื้นที่ผมไม่ตรงกับภาพ'});
   const maskPixels=await sharp(mask).ensureAlpha().raw().toBuffer();let covered=0;for(let i=3;i<maskPixels.length;i+=4)if(maskPixels[i])covered++;
   if(covered<16)return res.status(400).json({message:'ยังไม่มีพื้นที่ผมสำหรับปรับ'});
   const key=process.env.ARK_API_KEY;if(!key)return res.status(503).json({message:'ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์'});
   const model=process.env.ARK_MODEL||'dola-seedream-5-0-pro-260628';
   const id=createHash('sha256').update(model).update(prompt).update(input).update(mask).digest('hex');prune();
   if(cache.has(id))return res.set('Cache-Control','no-store').type('png').send(cache.get(id).png);
   let task=pending.get(id);
   if(!task){task=(async()=>{
    const signal=AbortSignal.timeout(150000),context=await sharp(input).flatten({background:'#ffffff'}).png().toBuffer();
    const r=await fetchImpl('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',{method:'POST',signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,prompt,image:`data:image/png;base64,${context.toString('base64')}`,size:'2K',output_format:'png',response_format:'url',watermark:false})});
    const body=await r.json();if(!r.ok||!body?.data?.[0]?.url)throw Error('AI ยังปรับผมไม่สำเร็จ');
    const out=await fetchImpl(body.data[0].url,{signal});if(!out.ok)throw Error('โหลดผลสีผมไม่สำเร็จ');
    const png=await hairOnlyOverlay(input,Buffer.from(await out.arrayBuffer()),mask);
    if(png.length<=64*1024*1024){cache.set(id,{png,until:Date.now()+10*60*1000});bytes+=png.length;prune()}return png;
   })();pending.set(id,task);task.finally(()=>pending.delete(id)).catch(()=>{});}
   const png=await task;res.set('Cache-Control','no-store').type('png').send(png);
  }catch(e){console.error('Hair finish:',e.message);res.status(502).json({message:'ปรับสีผมไม่สำเร็จ · งานเดิมยังอยู่ กรุณาลองอีกครั้ง'})}
 });
}
