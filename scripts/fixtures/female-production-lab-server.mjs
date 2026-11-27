import {createHash} from 'node:crypto';
// Local browser fixture only: provider and matting are mocked; no API key leaves this server.
import express from 'express';
import sharp from 'sharp';
import {registerFemaleProductionLab} from '../../female-production-lab.js';
const png=await sharp(new URL('../../public/assets/home-previews/easy-original-v20261031.webp',import.meta.url).pathname).png().toBuffer();
const mask=await sharp(png).ensureAlpha().extend({top:1,bottom:1,left:1,right:1,background:'#00000000'}).png().toBuffer();
const app=express();let calls=0,lastReferences=null;
app.get('/api/test-references',(_req,res)=>res.json(lastReferences));
app.get('/api/test-count',(_req,res)=>res.json({calls}));
registerFemaleProductionLab(app,{removeBackground:async()=>mask,fetchImpl:async(_url,options)=>{calls++;const payload=JSON.parse(options.body);lastReferences={model:payload.model,hashes:payload.image.map(x=>createHash('sha256').update(Buffer.from(x.split(',')[1],'base64')).digest('hex'))};return {ok:true,json:async()=>({data:[{b64_json:png.toString('base64')}]})};}});
app.use(express.static(new URL('../../public',import.meta.url).pathname));
app.listen(Number(process.env.PRODUCTION_LAB_TEST_PORT||5215),'127.0.0.1');
