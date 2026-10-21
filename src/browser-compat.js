// UI identifiers are not authentication tokens. Older Safari can lack randomUUID.
let fallbackSequence=0;
export function createBrowserId(){
 const cryptoApi=globalThis.crypto;
 if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID();
 const bytes=new Uint8Array(16);
 if(typeof cryptoApi?.getRandomValues==='function')cryptoApi.getRandomValues(bytes);
 else{
  for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  let sequence=Date.now()+(++fallbackSequence);
  for(let i=15;i>=10;i--){bytes[i]=sequence%256;sequence=Math.floor(sequence/256)}
 }
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,v=>v.toString(16).padStart(2,'0'));
 return hex.slice(0,4).join('')+'-'+hex.slice(4,6).join('')+'-'+hex.slice(6,8).join('')+'-'+hex.slice(8,10).join('')+'-'+hex.slice(10).join('');
}

export const lastItem=values=>values[values.length-1];

export function listenMediaQuery(query,onChange){
 if(typeof query.addEventListener==='function'){
  query.addEventListener('change',onChange);
  return()=>query.removeEventListener('change',onChange);
 }
 if(typeof query.addListener==='function'){
  query.addListener(onChange);
  return()=>query.removeListener(onChange);
 }
 globalThis.window?.addEventListener('resize',onChange);
 return()=>globalThis.window?.removeEventListener('resize',onChange);
}

export function observeElementResize(onResize,...elements){
 if(typeof globalThis.ResizeObserver==='function'){
  const observer=new ResizeObserver(onResize);
  elements.forEach(element=>observer.observe(element));
  return()=>observer.disconnect();
 }
 const viewport=globalThis.window?.visualViewport;
 globalThis.window?.addEventListener('resize',onResize);
 viewport?.addEventListener('resize',onResize);
 return()=>{globalThis.window?.removeEventListener('resize',onResize);viewport?.removeEventListener('resize',onResize)};
}
