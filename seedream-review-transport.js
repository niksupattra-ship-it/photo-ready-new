// Transport for the isolated review server; no production route or key fallback.
export const REVIEW_SEEDREAM_MODEL='dola-seedream-5-0-flash-260915';
export const REVIEW_SEEDREAM_ENDPOINT='https://ark.ap-southeast.bytepluses.com/api/v3/images/generations';
export function seedreamReviewPayload({prompt,portrait,portraitMime='image/png',hair,size='2K'}){
 if(!portrait?.length)throw Error('ไม่มีภาพคนสำหรับ Seedream');
 const image=[`data:${portraitMime};base64,${Buffer.from(portrait).toString('base64')}`];
 if(hair?.length)image.push(`data:image/png;base64,${Buffer.from(hair).toString('base64')}`);
 return {model:REVIEW_SEEDREAM_MODEL,prompt,image:image.length===1?image[0]:image,size,output_format:'png',response_format:'b64_json',watermark:false};
}
export async function requestReviewSeedream(options,{fetchImpl=fetch,timeoutMs=240000}={}){
 const {key}=options;
 if(!key)throw Object.assign(Error('ยังไม่ได้ตั้งค่า ARK_API_KEY '),{status:500});
 const signal=AbortSignal.timeout(timeoutMs);
 let response;
 try{response=await fetchImpl(REVIEW_SEEDREAM_ENDPOINT,{signal,method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(seedreamReviewPayload(options))});}
 catch(e){if(signal.aborted)throw Object.assign(Error('Seedream ใช้เวลาเกิน 4 นาที กรุณาลองใหม่'),{status:504,code:'seedream_timeout'});throw e}
 const body=await response.json().catch(()=>null);
 if(signal.aborted)throw Object.assign(Error('Seedream ใช้เวลาเกิน 4 นาที กรุณาลองใหม่'),{status:504,code:'seedream_timeout'});
 if(!response.ok){
  const detail=String(body?.error?.message||body?.message||'คำขอไม่สำเร็จ').slice(0,600);
  throw Object.assign(Error(`Seedream ประมวลผลไม่สำเร็จ (${response.status}): ${detail}`),{status:response.status,code:body?.error?.code||'seedream_failed'});
 }
 const b64=body?.data?.[0]?.b64_json;
 if(typeof b64!=='string'||!b64.length)throw Object.assign(Error('Seedream ไม่ได้ส่งภาพกลับมา'),{status:502});
 const png=Buffer.from(b64,'base64');
 if(png.length<8||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Object.assign(Error('Seedream ส่งผลลัพธ์ที่ไม่ใช่ PNG'),{status:502});
 return {png,requestId:response.headers?.get?.('x-request-id')||''};
}
