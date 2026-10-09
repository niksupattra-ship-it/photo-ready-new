import sharp from 'sharp';
import {validateMakeupStyles,makeupPrompt} from './makeup-presets.js';

// Unlimited makeup: no wallet reservation, deduction or daily-trial usage.
// Separate route and prompt; the existing face/skin/neck pipeline is untouched.
export function registerMakeupApi(app,{upload,fetchImpl=(...args)=>fetch(...args)}){
 app.post('/api/makeup/edit',upload.single('image'),async(req,res)=>{
  try{
   if(!req.file) return res.status(400).json({message:'ไม่พบรูปสำหรับเมคอัพ'});
   let styles;try{styles=validateMakeupStyles(JSON.parse(req.body?.styles||'null'))}catch(e){return res.status(400).json({message:e.message})}
   const key=process.env.ARK_API_KEY;if(!key)return res.status(503).json({message:'ยังไม่ได้ตั้งค่า AI บนเซิร์ฟเวอร์'});
   const metadata=await sharp(req.file.buffer,{limitInputPixels:33554432}).metadata();
   if(!metadata.width||!metadata.height||metadata.width*metadata.height>33554432)throw Error('ขนาดภาพไม่ถูกต้อง');
   // Browser uploads are already oriented PNGs. Avoid recompressing unchanged pixels.
   const input=metadata.format==='png'&&(!metadata.orientation||metadata.orientation===1)?req.file.buffer:await sharp(req.file.buffer,{limitInputPixels:33554432}).rotate().png().toBuffer();
   const signal=AbortSignal.timeout(150000);
   const r=await fetchImpl('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',{
    method:'POST',signal,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.ARK_MODEL||'dola-seedream-5-0-pro-260628',prompt:makeupPrompt(styles),image:`data:image/png;base64,${input.toString('base64')}`,size:'2K',output_format:'png',response_format:'url',watermark:false})
   });
   const body=await r.json();if(!r.ok||!body?.data?.[0]?.url)throw Error('AI ยังแต่งเมคอัพไม่สำเร็จ กรุณาลองอีกครั้ง');
   const out=await fetchImpl(body.data[0].url,{signal});if(!out.ok)throw Error('โหลดผลเมคอัพไม่สำเร็จ');
   const result=Buffer.from(await out.arrayBuffer());
   const resultMetadata=await sharp(result,{limitInputPixels:33554432}).metadata();
   if(!resultMetadata.width||!resultMetadata.height||resultMetadata.width*resultMetadata.height>33554432)throw Error('ขนาดผลเมคอัพไม่ถูกต้อง');
   // The requested PNG is delivered as-is, preserving the provider's full detail.
   const png=resultMetadata.format==='png'?result:await sharp(result,{limitInputPixels:33554432}).png().toBuffer();
   res.set('Cache-Control','no-store').type('png').send(png);
  }catch(e){
   console.error('Makeup:',e.message);
   res.status(502).json({message:'แต่งเมคอัพไม่สำเร็จ กรุณาลองอีกครั้ง'});
  }
 });
}
