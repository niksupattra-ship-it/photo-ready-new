// Image delivery only: callers must verify purchase/session rights before calling.
const fileSavePanels=new Set();
export function dismissFileSavePanel(){
 const close=Array.from(fileSavePanels).pop();
 if(!close)return false;
 close();return true;
}
export function needsImageSavePanel(ua='',{maxTouchPoints=0,coarsePointer=false,mobile=false}={}){
 const safari=/AppleWebKit/i.test(ua)&&(/iPhone|iPad|iPod/i.test(ua)||(/Safari\//i.test(ua)&&!/Chrome|Chromium|CriOS|Edg|OPR|Android/i.test(ua)));
 const touchTablet=maxTouchPoints>0&&(coarsePointer||(/Macintosh/i.test(ua)&&maxTouchPoints>1));
 return safari||mobile||touchTablet||/Android|Mobile|Tablet|Silk\/|Kindle|Line\/|\bFBAN\b|\bFBAV\b|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|ByteLocale|Aweme|\bwv\b/i.test(ua);
}
export function deliverImage(blob,name,options={}){
 // This observer records browser actions, not proof of a device filesystem save.
 // It is deliberately synchronous/no-throw so it cannot consume the fresh
 // user gesture needed by native share or interrupt an otherwise valid export.
 const isImage=blob.type.startsWith('image/');
 const notify=(type,details={})=>{if(!isImage)return;try{const result=options?.onEvent?.(type,details);result?.catch?.(()=>{})}catch{}};
 const url=URL.createObjectURL(blob);
 const device={maxTouchPoints:navigator.maxTouchPoints||0,mobile:navigator.userAgentData?.mobile===true};
 try{device.coarsePointer=window.matchMedia('(pointer: coarse)').matches}catch{}
 if(!needsImageSavePanel(navigator.userAgent,device)){
  const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('download_requested',{method:'desktop_anchor'});return 'requested';
 }
 // Rendering and rights checks may consume the original tap. Save/share below
 // starts from a fresh gesture on mobile and tablet browsers.
 const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:2147483647';
 const root=host.attachShadow({mode:'open'});const previousFocus=document.activeElement;
 root.innerHTML=`<style>:host{font:15px system-ui,sans-serif;color:#152738}.backdrop{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;padding:12px}.panel{box-sizing:border-box;background:#fff;border-radius:16px;padding:18px;width:440px;max-width:100%;max-height:95dvh;overflow:auto}h2{font-size:20px;margin:0 0 8px}p{line-height:1.6;margin:8px 0}img{display:block;max-width:100%;max-height:52vh;object-fit:contain;margin:12px auto;user-select:auto;-webkit-touch-callout:default}.actions{display:flex;gap:8px;flex-wrap:wrap}button,a{box-sizing:border-box;font:inherit;border:1px solid #ccd8e3;border-radius:9px;padding:11px 14px;cursor:pointer;text-decoration:none;color:#152738;background:#fff}a,#share{background:#1763ba;color:#fff;border-color:#1763ba}.hint{font-size:13px;color:#536578}#message{font-size:13px;color:#536578}[hidden]{display:none!important}</style><div class="backdrop"><section class="panel" role="dialog" aria-modal="true" aria-labelledby="title"><h2 id="title">บันทึกรูปของคุณ</h2><p>กดบันทึกรูป หรือแชร์ไปยังแอปที่ต้องการ</p><img alt="รูปพร้อมบันทึกเต็มความละเอียด"><div class="actions"><a id="save">บันทึกรูป</a><button id="share" type="button" hidden>แชร์รูป</button><button id="close" type="button">ปิด</button></div><p class="hint">หากบันทึกไม่ได้ ให้กดค้างที่รูปแล้วเลือกบันทึกภาพ หากแอปยังไม่รองรับ ให้เปิดเว็บใน Chrome หรือ Safari ผ่านเมนูของแอป</p><p id="message" role="status"></p></section></div>`;
 const preview=root.querySelector('img');if(isImage)preview.src=url;else preview.hidden=true;
 const save=root.querySelector('#save');save.href=url;save.download=name;save.target='_blank';save.rel='noopener';
 if(!isImage){root.querySelector('#title').textContent='บันทึกไฟล์โปรเจกต์';root.querySelector('.panel>p').textContent='กดบันทึกไฟล์เพื่อเก็บงานไว้ในเครื่อง';save.textContent='บันทึกไฟล์';root.querySelector('.hint').textContent='เปิดไฟล์นี้ใน Studio เพื่อแก้ไขงานต่อได้'}
 const message=root.querySelector('#message');save.addEventListener('click',()=>{message.textContent=isImage?'ส่งคำขอบันทึกแล้ว หากไม่มีไฟล์ ให้กดค้างที่รูปหรือใช้ปุ่มแชร์รูป':'ส่งคำขอบันทึกไฟล์แล้ว กรุณาตรวจในรายการดาวน์โหลด';notify('save_clicked',{method:'save_link'})});
 let file;try{file=new File([blob],name,{type:blob.type||'image/png'})}catch{}
 const share=root.querySelector('#share');if(!isImage)share.textContent='แชร์ไฟล์';
 share.hidden=!(file&&typeof navigator.share==='function');
 // Some embedded browsers support share but omit or throw from canShare.
 // An explicit false is authoritative; otherwise offer the gesture and report errors.
 if(!share.hidden&&typeof navigator.canShare==='function')try{share.hidden=!navigator.canShare({files:[file]})}catch{}
 let sharing=false;
 share.addEventListener('click',()=>{
  if(sharing)return;
  sharing=true;share.disabled=true;share.setAttribute('aria-busy','true');message.textContent='กำลังเปิดเมนูแชร์…';notify('share_clicked',{method:'web_share'});
  const failed=e=>{const cancelled=e?.name==='AbortError';message.textContent=cancelled?'ยกเลิกการแชร์แล้ว':isImage?'แชร์รูปไม่ได้ ให้กดบันทึกรูปหรือกดค้างที่รูป หากแอปไม่รองรับ ให้เปิดใน Chrome / Safari':'แชร์ไฟล์ไม่ได้ ให้กดบันทึกไฟล์ หากแอปไม่รองรับ ให้เปิดใน Chrome / Safari';notify(cancelled?'share_cancelled':'download_failed',{method:'web_share',errorStage:'share',errorCode:cancelled?'share_cancelled':'share_failed'})};
  const finished=()=>{sharing=false;share.disabled=false;share.removeAttribute('aria-busy')};
  // Invoke share directly from this click; the file is already prepared.
  try{Promise.resolve(navigator.share({files:[file],title:isImage?'รูป IDพร้อม':'โปรเจกต์ IDพร้อม'})).then(()=>{message.textContent=isImage?'ส่งรูปไปยังช่องทางที่เลือกแล้ว':'ส่งไฟล์ไปยังช่องทางที่เลือกแล้ว';notify('share_handoff',{method:'web_share'})}).catch(failed).finally(finished)}catch(e){failed(e);finished()}
 });
 let closed=false;
 const close=()=>{if(closed)return;closed=true;fileSavePanels.delete(close);host.remove();previousFocus?.focus?.();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('panel_closed',{method:'mobile_panel'})};
 root.querySelector('#close').addEventListener('click',close);
 root.querySelector('.backdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)close()});
 root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}if(e.key==='Tab'){const buttons=[save,...(!share.hidden?[share]:[]),root.querySelector('#close')];const index=buttons.indexOf(root.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&index===buttons.length-1){e.preventDefault();save.focus()}}});
 document.body.appendChild(host);fileSavePanels.add(close);save.focus();notify('save_panel_opened',{method:'mobile_panel'});return 'panel';
}
