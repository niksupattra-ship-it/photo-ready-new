// Share in-flight work and discard a failed import. Attempts are provided to the
// browser importer so retries can avoid its cache of failed module requests.
export function createStudioEditorLoader(importEditor){
 let pending,attempt=0;
 return()=>{
  if(!pending){
   const request=Promise.resolve().then(()=>importEditor(attempt++));pending=request;
   request.catch(()=>{if(pending===request)pending=null});
  }
  return pending;
 };
}
