// A request deadline includes response-body consumption. Keep bodies lazy so a
// large image is not buffered/copied merely to obtain its headers or status.
export async function deadlineFetch(url,options={},config={}){
 const timeoutMs=Math.max(0,Number(config.timeoutMs??30000));
 const timeoutMessage=config.timeoutMessage||'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่';
 const sourceSignal=options.signal;
 const abortError=()=>Object.assign(Error('ยกเลิกการเชื่อมต่อแล้ว'),{name:'AbortError'});
 if(sourceSignal?.aborted)throw abortError();
 const controller=new AbortController(),pendingBodies=new Set(),readers=new Map();
 let timer,closed=false,failure=null,rejectDeadline;
 const deadline=new Promise((_,reject)=>{rejectDeadline=reject});
 const cleanup=()=>{if(closed)return;closed=true;clearTimeout(timer);sourceSignal?.removeEventListener('abort',cancel)};
 const fail=error=>{if(closed)return;failure=error;cleanup();controller.abort();rejectDeadline(error)};
 const cancel=()=>fail(abortError());
 sourceSignal?.addEventListener('abort',cancel,{once:true});
 timer=setTimeout(()=>fail(Object.assign(Error(timeoutMessage),{name:'TimeoutError',code:'REQUEST_TIMEOUT'})),Number.isFinite(timeoutMs)?timeoutMs:30000);
 const bounded=pending=>failure?Promise.reject(failure):Promise.race([pending,deadline]);
 const bodyDone=response=>{const remaining=(readers.get(response)||1)-1;if(remaining>0){readers.set(response,remaining);return}readers.delete(response);pendingBodies.delete(response);if(!pendingBodies.size)cleanup()};
 const methods=new Set(['json','text','blob','arrayBuffer','formData','bytes']);
 const wrap=response=>{
  pendingBodies.add(response);
  // HEAD/204 responses have no body to keep alive. Mocks with no `body`
  // property still retain their body-method deadline.
  if(response.body===null)bodyDone(response);
  const cache=new Map();
  return new Proxy(response,{get(target,key){
   const value=Reflect.get(target,key,target);
   if(key==='constructor')return value;
   if(typeof value!=='function')return value;
   if(cache.has(key))return cache.get(key);
   let method;
   if(methods.has(key))method=(...args)=>{
    if(failure)return Promise.reject(failure);
    readers.set(target,(readers.get(target)||0)+1);
    let read;try{read=value.apply(target,args)}catch(error){bodyDone(target);return Promise.reject(error)}
    return bounded(read).then(result=>{bodyDone(target);return result},error=>{bodyDone(target);throw error});
   };
   else if(key==='clone')method=()=>{if(failure)throw failure;return wrap(value.call(target))};
   else method=value.bind(target);
   cache.set(key,method);return method;
  }});
 };
 try{
  const request=Promise.resolve().then(()=>{if(failure)throw failure;return fetch(url,{...options,signal:controller.signal})});
  // An uncooperative transport can resolve after cancellation. Release its
  // unread stream without exposing the late response to a stale caller.
  request.then(response=>{if(failure)try{Promise.resolve(response.body?.cancel()).catch(()=>{})}catch{}},()=>{});
  return wrap(await bounded(request));
 }catch(error){cleanup();throw failure||error}
}
