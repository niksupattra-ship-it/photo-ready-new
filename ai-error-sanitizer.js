export function sanitizeAiError(value){
 return String(value||'AI processing failed')
  .replace(/\bsk-[A-Za-z0-9_-]{12,}/g,'[REDACTED]')
  .replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]')
  .replace(/\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))\s*=\s*(["']?)[^\s"']+\2/g,'$1=[REDACTED]')
  .slice(0,2000);
}
export function sanitizedAiJob(row){return row&&row.error?{...row,error:sanitizeAiError(row.error)}:row||null}
