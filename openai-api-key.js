// Accept a bare key or a pasted dotenv first line. Never evaluate dotenv text,
// send trailing assignments in Authorization, or include the input in errors.
export function openaiApiKey(value){
 if(typeof value!=='string'||!value.trim())throw Object.assign(Error('ยังไม่ได้ตั้งค่า OPENAI_API_KEY'),{status:503,code:'openai_not_configured'});
 const first=value.trim().split(/\r?\n/,1)[0].trim().replace(/^OPENAI_API_KEY\s*=\s*/,'');
 const key=first.replace(/^["']/,'').replace(/["']$/,'').trim();
 if(!/^[A-Za-z0-9_-]{4,}$/.test(key))throw Object.assign(Error('รูปแบบ OPENAI_API_KEY ไม่ถูกต้อง กรุณาตรวจค่าตั้งเซิร์ฟเวอร์'),{status:503,code:'openai_key_invalid'});
 return key;
}
