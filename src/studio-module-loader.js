// Share one download across photo preparation and editor mounting. A failed
// attempt is released so opening/retrying never gets stuck on a rejected promise.
export function createStudioModuleLoader(importModule,{timeoutMs=30000}={}){
 let pending=null,loaded=null;
 return {
  current:()=>loaded,
  load(){
   if(!pending){
    let timer;
    const timeout=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Editing tools download timed out')),timeoutMs)});
    const request=Promise.race([Promise.resolve().then(importModule),timeout]).then(module=>{
     if(typeof module.StudioEditor!=='function')throw Error('Editing tools unavailable');
     loaded=module;return module;
    }).finally(()=>clearTimeout(timer));
    pending=request;
    void request.catch(()=>{if(pending===request)pending=null});
   }
   return pending;
  }
 };
}
