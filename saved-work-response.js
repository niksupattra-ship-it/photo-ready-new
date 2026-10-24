import {brotliCompress,gzip,constants} from 'node:zlib';
import {promisify} from 'node:util';

const brotli=promisify(brotliCompress),gzipAsync=promisify(gzip);
export async function sendSavedWorkResponse(req,res,value){
 if(req.aborted||res.destroyed)return;
 const json=JSON.stringify(value),bytes=Buffer.byteLength(json);
 res.vary('Accept-Encoding');res.type('application/json');
 const encoding=req.acceptsEncodings('br','gzip','identity');
 if(bytes>=128*1024&&(encoding==='br'||encoding==='gzip')){
  try{
   const compressed=encoding==='br'
    ?await brotli(json,{params:{[constants.BROTLI_PARAM_QUALITY]:4,[constants.BROTLI_PARAM_LGWIN]:24}})
    :await gzipAsync(json,{level:1});
   if(req.aborted||res.destroyed)return;
   if(compressed.length<bytes){res.set('Content-Encoding',encoding);return res.send(compressed)}
  }catch{}
 }
 if(!req.aborted&&!res.destroyed)return res.send(json);
}
