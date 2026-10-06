// Image delivery only: callers must verify purchase/session rights before calling.
export function needsImageSavePanel(ua=''){
 return /Line\/|\bFBAN\b|\bFBAV\b|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|ByteLocale|Aweme|\bwv\b/i.test(ua);
}
export function deliverImage(blob,name){
 const url=URL.createObjectURL(blob);
 if(!needsImageSavePanel(navigator.userAgent)){
  const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'requested';
 }
 const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647';
 const root=host.attachShadow({mode:'open'});const previousFocus=document.activeElement;
 root.innerHTML=`<style>:host{font:15px system-ui,sans-serif;color:#152738}.backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px}.panel{box-sizing:border-box;background:#fff;border-radius:16px;padding:18px;width:440px;max-width:100%;max-height:95dvh;overflow:auto}h2{font-size:20px;margin:0 0 8px}p{line-height:1.6;margin:8px 0}img{display:block;max-width:100%;max-height:52vh;object-fit:contain;margin:12px auto;user-select:auto;-webkit-touch-callout:default}.actions{display:flex;gap:8px;flex-wrap:wrap}button,a{box-sizing:border-box;font:inherit;border:1px solid #ccd8e3;border-radius:9px;padding:11px 14px;cursor:pointer;text-decoration:none;color:#152738;background:#fff}a,#share{background:#1763ba;color:#fff;border-color:#1763ba}.hint{font-size:13px;color:#536578}#message{font-size:13px;color:#536578}[hidden]{display:none!important}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title"><h2 id="title">บันทึกรูปของคุณ</h2><p>กดบันทึกรูป หรือแชร์ไปยังแอปที่ต้องการ</p><img alt="รูปพร้อมบันทึกเต็มความละเอียด"><div class="actions"><a id="save">บันทึกรูป</a><button id="share" type="button" hidden>แชร์รูป</button><button id="close" type="button">ปิด</button></div><p class="hint">หากบันทึกไม่ได้ ให้กดค้างที่รูปแล้วเลือกบันทึกภาพ หากแอปยังไม่รองรับ ให้เปิดเว็บใน Chrome หรือ Safari ผ่านเมนูของแอป</p><p id="message" role="status"></p></section></div>`;
 root.querySelector('img').src=url;const save=root.querySelector('#save');save.href=url;save.download=name;
 const message=root.querySelector('#message');save.addEventListener('click',()=>{message.textContent='ส่งคำขอบันทึกแล้ว หากไม่มีไฟล์ ให้กดค้างที่รูปหรือใช้ปุ่มแชร์รูป'});
 let file;try{file=new File([blob],name,{type:blob.type||'image/png'})}catch{}
 const share=root.querySelector('#share');
 try{share.hidden=!(file&&navigator.share&&navigator.canShare?.({files:[file]}))}catch{share.hidden=true}
 share.addEventListener('click',()=>{
  // Invoke share directly from this click; the image file is already prepared.
  try{navigator.share({files:[file],title:'รูป IDพร้อม'}).then(()=>{message.textContent='ส่งรูปไปยังช่องทางที่เลือกแล้ว'}).catch(e=>{message.textContent=e.name==='AbortError'?'ยกเลิกการแชร์แล้ว':'แอปนี้ไม่อนุญาตให้แชร์รูป ให้กดค้างที่รูปเพื่อบันทึก หรือเปิดใน Chrome / Safari'})}catch{message.textContent='แชร์รูปไม่ได้ ให้กดค้างที่รูปเพื่อบันทึก'}
 });
 const close=()=>{host.remove();previousFocus?.focus?.();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 root.querySelector('#close').addEventListener('click',close);
 root.querySelector('.backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)close()});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const buttons=[save,...(!share.hidden?[share]:[]),root.querySelector('#close')];const index=buttons.indexOf(root.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();buttons.at(-1).focus()}else if(!e.shiftKey&&index===buttons.length-1){e.preventDefault();save.focus()}}});
 document.body.appendChild(host);save.focus();return 'panel';
}
