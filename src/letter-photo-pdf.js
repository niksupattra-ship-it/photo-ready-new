export const LETTER_PAGE={width:612,height:792};
// 210 × 297 mm at 72 PDF points per inch. Thai print sheets use A4;
// existing English/Letter layouts and image dimensions remain unchanged.
export const A4_PAGE={width:210*72/25.4,height:297*72/25.4};
function photoPageLayout(widthMm,heightMm,copies,page){
 if(![widthMm,heightMm].every(v=>Number.isFinite(v)&&v>0))throw Error('Choose a print size.');
 const width=widthMm*72/25.4,height=heightMm*72/25.4,margin=18,gap=9;
 const columns=Math.floor((page.width-2*margin+gap)/(width+gap)),rows=Math.floor((page.height-2*margin+gap)/(height+gap));
 if(columns<1||rows<1)throw Error(page===LETTER_PAGE?'This photo size does not fit on Letter paper.':'This photo size does not fit on A4 paper.');
 const capacity=columns*rows,count=copies==null?capacity:Math.min(capacity,Math.max(1,Math.floor(Number(copies)||1)));
 const positions=Array.from({length:count},(_,i)=>({x:margin+(i%columns)*(width+gap),y:page.height-margin-height-Math.floor(i/columns)*(height+gap),width,height}));
 return {width:page.width,height:page.height,capacity,count,positions};
}
export const letterPhotoLayout=(widthMm,heightMm,copies)=>photoPageLayout(widthMm,heightMm,copies,LETTER_PAGE);
export const a4PhotoLayout=(widthMm,heightMm,copies)=>photoPageLayout(widthMm,heightMm,copies,A4_PAGE);
// One JPEG embedded once, drawn repeatedly at exact PDF point dimensions.
// No printer dialog or browser page margins can change the saved page size.
export function letterPhotoPdf(jpeg,pixelWidth,pixelHeight,layout){
 const encoder=new TextEncoder(),chunks=[],offsets=[0];let length=0;
 const append=value=>{const data=typeof value==='string'?encoder.encode(value):value;chunks.push(data);length+=data.length};
 const object=(id,body)=>{offsets[id]=length;append(id+' 0 obj\n');body();append('\nendobj\n')};
 append('%PDF-1.4\n');
 object(1,()=>append('<< /Type /Catalog /Pages 2 0 R >>'));
 object(2,()=>append('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
 object(3,()=>append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Number(layout.width.toFixed(6))} ${Number(layout.height.toFixed(6))}] /Resources << /XObject << /Photo 4 0 R >> >> /Contents 5 0 R >>`));
 object(4,()=>{append(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);append(jpeg);append('\nendstream')});
 const number=n=>Number(n.toFixed(6));
 const stream=layout.positions.map(p=>`q ${number(p.width)} 0 0 ${number(p.height)} ${number(p.x)} ${number(p.y)} cm /Photo Do Q`).join('\n');
 object(5,()=>append(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`));
 const xref=length;append('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)append(String(offsets[i]).padStart(10,'0')+' 00000 n \n');append(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 return new Blob(chunks,{type:'application/pdf'});
}
