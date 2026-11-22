export const THAI_COLLARLESS_PREVIOUS_VERSION='thai-female-no-inner-collar-v1';
export const THAI_COLLARLESS_PRIMARY_VERSION='thai-female-no-inner-collar-v2-primary';
export const THAI_AI_COLLARLESS_VERSION='thai-ai-garment-rear-hair-v3';
export const THAI_COLLARLESS_VERSION='thai-ai-original-single-collar-rear-hair-v4';
export function collarlessTemplatePath(template){
 const match=/^\/assets\/government-uniforms\/(female-(?:operational|academic|senior|government-employee))\.png$/.exec(template||'');
 return match?'/assets/government-uniforms/collarless-v2/'+match[1]+'.webp':null;
}
