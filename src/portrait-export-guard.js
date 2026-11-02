const incomplete=()=>Object.assign(Error('ยังส่งออกรูปไม่ได้ เพราะไม่พบหัวและใบหน้าในภาพที่จะบันทึก กรุณาตรวจเลเยอร์หัวหรือเปิดงานเดิมอีกครั้ง สิทธิ์ที่ชำระแล้วยังอยู่ ไม่ต้องชำระเงินซ้ำ'),{code:'PORTRAIT_EXPORT_INCOMPLETE',auditCode:'portrait_incomplete'});
const isHead=layer=>layer.kind==='head'||layer.kind==='source-photo'||layer.name==='หัว · คอ · ผม';

// Inspect the actual renderer's pixel contribution, not just a paid job ID.
// Small temporary canvases never alter the full-resolution source or output.
export function assertPortraitExportReady(layers,assets,render,createCanvas=()=>document.createElement('canvas')){
 const heads=layers.filter(layer=>isHead(layer)&&layer.visible!==false&&Number(layer.opacity??1)>0);
 if(!heads.length)throw incomplete();
 const surfaces=[];
 const surface=()=>{const c=createCanvas();c.width=192;c.height=256;surfaces.push(c);return c};
 const pixels=(c,subset)=>{const ctx=c.getContext('2d',{willReadFrequently:true});render(ctx,subset,assets,layers);return ctx.getImageData(0,0,c.width,c.height).data};
 try{
  const full=surface(),without=surface(),alone=surface(),actual=pixels(full,layers);
  for(const head of heads){
   const asset=assets.get(head.id);if(!asset?.buffer?.width||!asset.buffer.height)continue;
   const support=pixels(alone,[head]);let count=0;
   for(let i=3;i<support.length;i+=4)if(support[i]>=32)count++;
   if(count<32)continue;
   const other=pixels(without,layers.filter(layer=>layer.id!==head.id));let visible=0;
   for(let i=0;i<actual.length;i+=4)if(support[i+3]>=32&&Math.abs(actual[i]-other[i])+Math.abs(actual[i+1]-other[i+1])+Math.abs(actual[i+2]-other[i+2])+Math.abs(actual[i+3]-other[i+3])>=12)visible++;
   if(visible>=Math.max(32,count*.08))return true;
  }
  throw incomplete();
 }finally{for(const c of surfaces){c.width=1;c.height=1}}
}
