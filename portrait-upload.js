import {createHash} from 'node:crypto';

// Reuse only an owned work's byte-for-byte original. An older levelled
// canonical image must fall back to an upload, never silently replace it.
export function provenOriginalInput(row,sha256){
 if(!/^[a-f0-9]{64}$/.test(sha256||'')||!row?.canonical_image?.length)return null;
 const buffer=Buffer.from(row.canonical_image);
 if(row.original_source_hash!==sha256||createHash('sha256').update(buffer).digest('hex')!==sha256)return null;
 return {buffer,mimetype:row.canonical_type||'image/png',originalname:'original-portrait'};
}

export async function preparePortraitUpload(req,{policy,wallet,recoverWork,isOriginalRequest}){
 if(req.body?.reuseOriginalSource==='1'){
  if(!req.is('application/json')||req.files&&Object.keys(req.files).length||!isOriginalRequest(req.body))throw Object.assign(Error('invalid_source_reuse'),{status:400});
  const work=await recoverWork(policy,wallet,req.body);
  const input=await policy.originalInputForWork(wallet,work,req.body.originalSourceSha256);
  // No credit or generation has been reserved at this point. The browser can
  // safely fall back once to the original upload for legacy/missing work data.
  if(!input)throw Object.assign(Error('original_upload_required'),{status:428,code:'original_upload_required'});
  req.body.downloadWorkId=work;req.files={image:[input],originalSource:[input]};
 }
 if(req.body?.originalSourceIsImage==='1'){
  const image=req.files?.image?.[0];
  if(!image||req.files?.originalSource?.length)throw Object.assign(Error('invalid_original_alias'),{status:400});
  // One physical file serves both roles; downstream source-hash, ownership and
  // original-image validations still see exactly the same unmodified bytes.
  req.files.originalSource=[image];
 }
 delete req.body?.reuseOriginalSource;delete req.body?.originalSourceSha256;delete req.body?.originalSourceIsImage;
}
