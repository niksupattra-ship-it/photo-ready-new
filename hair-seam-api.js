import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';


// Explicit hair-seam action: one provider call, no portrait-credit/trial mutation.
// Separate route and prompt; the existing face/skin/neck pipeline is untouched.
export function registerHairSeamApi(app,{upload,fetchImpl=(...args)=>fetch(...args)}){
 // Short-lived exact-input cache; no portraits or outputs are written to disk.
 const cache=new Map(),pending=new Map(),TTL=10*60*1000,MAX_BYTES=64*1024*1024;
 let cacheBytes=0;
 const prune=()=>{const now=Date.now();for(const [id,item] of cache){if(item.until<=now){cache.delete(id);cacheBytes-=item.png.length}}while(cache.size>16||cacheBytes>MAX_BYTES){const id=cache.keys().next().value;cacheBytes-=cache.get(id).png.length;cache.delete(id)}};
 const remember=(id,png)=>{prune();if(png.length>MAX_BYTES)return;if(cache.has(id))cacheBytes-=cache.get(id).png.length;cache.delete(id);cache.set(id,{png,until:Date.now()+TTL});cacheBytes+=png.length;prune()};
 app.post('/api/hair/seam' ,upload.single('image'),async(req,res)=>{
  const started=performance.now(),timings=[];let pendingId=null,finish=null,fail=null;
  const timed=(name,from)=>timings.push(`${name};dur=${(performance.now()-from).toFixed(1)}`);
  const send=png=>{timed('total',started);res.set('Server-Timing',timings.join(', '));return res.set('Cache-Control','no-store').type('png').send(png)};
  try{
   if(!req.file) return res.status(400).json({message:'ไม่พบรูปสำหรับรอยต่อผม'});

   const key=process.env.ARK_API_KEY;if(!key)return res.status(503).json({message:'ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์'});
   const prepStarted=performance.now();
   const metadata=await sharp(req.file.buffer,{limitInputPixels:33554432}).metadata();
   if(!metadata.width||!metadata.height||metadata.width*metadata.height>33554432)throw Error('ขนาดภาพไม่ถูกต้อง');
   // Browser uploads are already oriented PNGs. Avoid recompressing unchanged pixels.
   const input=metadata.format==='png'&&(!metadata.orientation||metadata.orientation===1)?req.file.buffer:await sharp(req.file.buffer,{limitInputPixels:33554432}).rotate().png().toBuffer();
   timed('prepare',prepStarted);
   const model=process.env.ARK_MODEL||'dola-seedream-5-0-pro-260628',prompt=`Unify ALL visible hair and the head in this composed portrait into ONE seamless realistic head, not a narrow seam patch. Use the currently placed hairstyle as the design: preserve its parting, fringe, crown, length and overall size. Reconstruct missing hair where there are gaps between placed sections, roots and ear junctions. Trim detached outlines, excess pasted pieces and original hair protruding outside the selected style. Harmonize strand direction, density, lighting and transitions across the entire hairstyle. Fit this hairstyle naturally to this person's forehead, temples and ears. Keep fine realistic edges without halos, straight cutouts or invented loose strands beside ears or neck. Preserve identity, face geometry, eyebrows, eyes, nose, mouth, skin texture, makeup, ears, neck and shoulders exactly. No face replacement, slimming, stretching or beautification. Keep exact framing and head position. Background stays plain white; no clothes or accessories are added. Return the complete refined portrait; the client restores original skin pixels and accepts only the refined hair.`;
   const id=createHash('sha256').update(model).update('\0').update(prompt).update('\0').update(input).digest('hex');
   prune();const cached=cache.get(id);
   if(cached){cache.delete(id);cache.set(id,cached);timings.push('cache;dur=0;desc="Reused exact result"');return send(cached.png)}
   if(pending.has(id)){const waiting=performance.now(),png=await pending.get(id);timed('shared_wait',waiting);return send(png)}
   // Coalesce duplicate calls without imposing a queue on different portraits/looks.
   if(pending.size<16){pendingId=id;const promise=new Promise((resolve,reject)=>{finish=resolve;fail=reject});promise.catch(()=>{});pending.set(id,promise)}
   const signal=AbortSignal.timeout(150000),aiStarted=performance.now();
   const r=await fetchImpl('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',{
    method:'POST',signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,prompt,image:`data:image/png;base64,${input.toString('base64')}`,size:'2K',output_format:'png',response_format:'url',watermark:false})
   });
   const body=await r.json();if(!r.ok||!body?.data?.[0]?.url)throw Error('AI ยังแต่งรอยต่อผมไม่สำเร็จ กรุณาลองอีกครั้ง');
   timed('ai',aiStarted);const downloadStarted=performance.now();
   const out=await fetchImpl(body.data[0].url,{signal});if(!out.ok)throw Error('โหลดผลรอยต่อผมไม่สำเร็จ');
   const result=Buffer.from(await out.arrayBuffer());
   timed('result_download',downloadStarted);const outputStarted=performance.now();
   const resultMetadata=await sharp(result,{limitInputPixels:33554432}).metadata();
   if(!resultMetadata.width||!resultMetadata.height||resultMetadata.width*resultMetadata.height>33554432)throw Error('ขนาดผลรอยต่อผมไม่ถูกต้อง');
   // The requested PNG is delivered as-is, preserving the provider's full detail.
   const png=resultMetadata.format==='png'?result:await sharp(result,{limitInputPixels:33554432}).png().toBuffer();
   timed('output',outputStarted);remember(id,png);finish?.(png);send(png);
  }catch(e){
   fail?.(e);
   console.error('Hair seam:',e.message);
   res.status(502).json({message:'แต่งรอยต่อผมไม่สำเร็จ กรุณาลองอีกครั้ง'});
  }finally{if(pendingId)pending.delete(pendingId)}
 });
}
