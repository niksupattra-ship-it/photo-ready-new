// Keep one bounded, exact pixel snapshot. Edits invalidate it even if a canvas
// object is reused; placement and outfit changes do not rerun face inference.
export function createFaceMeasurementCache(){
 let current=null;
 return function measure(sample,detect){
  const {width,height,pixels}=sample;
  let same=current?.detect===detect&&current.width===width&&current.height===height&&current.pixels.length===pixels.length;
  if(same)for(let i=0;i<pixels.length;i++)if(pixels[i]!==current.pixels[i]){same=false;break}
  if(same)return current.promise;
  const entry={detect,width,height,pixels:pixels.slice(),promise:null};
  entry.promise=Promise.resolve().then(()=>detect(sample.canvas)).catch(error=>{if(current===entry)current=null;throw error});
  current=entry;
  return entry.promise;
 };
}
