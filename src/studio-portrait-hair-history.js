// Accepted full-outfit portrait variants for the SAME uploaded file.
// Restore exact finished AI pixels, never a new generation or a donor face.
// Session-only: old jobs are separately handled by the purchase/job store.
export function createStudioPortraitHairHistory(maxEntries=24){
 const entries=new Map();
 const key=({scope,template,mode,hair,finish,version})=>
  JSON.stringify([scope||'',template||'',mode||'',hair||'',finish||'',version||'']);
 return {
  clear(){entries.clear()},
  remember(data){
   if(!data?.source||!data?.master||!data?.lock||!data?.jobId)return false;
   const k=key(data);
   entries.delete(k);
   entries.set(k,{...data,confirmed:true});
   while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
   return true;
  },
  find(query){
   if(!query?.source)return null;
   const saved=entries.get(key(query));
   return saved?.confirmed&&saved.source===query.source&&saved.scope===query.scope&&
     saved.template===query.template&&saved.mode===query.mode&&
     (saved.hair||'')===(query.hair||'')&&saved.finish===query.finish&&
     saved.version===query.version?saved:null;
  },
  size(){return entries.size}
 };
}
