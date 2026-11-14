import React from 'react';
import {AccountFlowDialog} from './account-flow-dialog.jsx';
import './package-code-dialog.css';

export function PackageCodeDialog({code='',onCode,onSubmit,onClose,onSignIn,isAuthenticated=false,hasOutput=false,busy=false,message='',result=null}){
 return <AccountFlowDialog label="ใส่โค้ด" initialFocus={result?'#idprom-package-code-done':'#idprom-package-code'} busy={busy} onClose={onClose}>
  <div className="package-code-backdrop"><section className="package-code-card" aria-busy={busy}>
   <button type="button" className="package-code-close" aria-label="ปิดใส่โค้ด" disabled={busy} onClick={onClose}>×</button>
   <span className="package-code-brand">IDพร้อม</span>
   <h2>{result?'ใช้โค้ดสำเร็จ':'ใส่โค้ด'}</h2>
   {result?<><p className="package-code-success" role="status">ปลดล็อกโปร {result.packageId} บาทสำหรับรูปนี้แล้ว</p><ul><li>ดาวน์โหลดภาพไม่มีลายน้ำ</li><li>เลือกชุดได้ {result.packageId==='159'?5:3} ชุด</li><li>{result.packageId==='159'?'ปลดล็อกทรงผมพรีเมียม':'ทรงผมพื้นฐาน'}</li></ul><button type="button" className="package-code-primary" id="idprom-package-code-done" onClick={onClose}>กลับไปดาวน์โหลดรูป</button></>:<form onSubmit={e=>{e.preventDefault();if(!busy&&isAuthenticated&&hasOutput&&code.trim())onSubmit?.()}}>
    <label htmlFor="idprom-package-code">โค้ด</label>
    <input id="idprom-package-code" name="package-code" value={code} onChange={e=>onCode?.(e.target.value)} disabled={busy} maxLength={120} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="กรอกโค้ดของคุณ"/>
    {message&&<p className="package-code-error" role="alert">{message}</p>}
    {isAuthenticated?<button type="submit" className="package-code-primary" disabled={busy||!hasOutput||!code.trim()}>{busy?'กำลังตรวจสอบโค้ด…':'ใช้โค้ด'}</button>:<button type="button" className="package-code-primary" disabled={busy} onClick={onSignIn}>เข้าสู่ระบบ</button>}
   </form>}
  </section></div>
 </AccountFlowDialog>;
}
