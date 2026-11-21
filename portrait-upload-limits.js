// New quality revisions add small version fields, not extra image bytes.
// Keep image/count/value-size bounds while accepting the complete request.
export const PORTRAIT_UPLOAD_LIMITS=Object.freeze({
 fileSize:20*1024*1024,files:2,fields:48,parts:52,fieldSize:1024*1024
});
