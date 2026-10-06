import React from 'react';

const rows = [
 ['ดาวน์โหลดรูปทดลอง ไม่มีลายน้ำ', '✓', '✓'],
 ['เครดิตประมวลผลเพิ่มเติม', 'ไม่มี', '3 ครั้ง'],
 ['เปลี่ยนรูปต้นฉบับเพื่อสร้างใหม่', 'ไม่มีสิทธิ์สร้างใหม่', '3 ครั้ง'],
 ['เลือกทรงผมพร้อมประมวลผล', 'ใช้ทรงผมในรูปทดลองเดิม', '3 ครั้ง'],
 ['เปลี่ยนชุด / พื้นหลัง / ปรับแต่งใน Studio', 'ได้ตามปกติสำหรับรูปที่ซื้อ', 'ได้เต็มระหว่างมีเครดิต'],
];

export function PackageOffers({payBusy,payMsg,hasTrial,startCheckout}){
 return <>
  <style>{`
   .package-compare-wrap{width:100%;overflow-x:auto;margin:20px 0 14px;border:1px solid #dce3ed;border-radius:14px;background:#fff}
   .package-compare{width:100%;border-collapse:collapse;table-layout:fixed;color:#24344b;font-size:14px;line-height:1.6}
   .package-compare th,.package-compare td{padding:15px 12px;border-bottom:1px solid #e5eaf1;vertical-align:middle;overflow-wrap:anywhere}
   .package-compare th:first-child,.package-compare td:first-child{width:40%;text-align:left}
   .package-compare th:not(:first-child),.package-compare td:not(:first-child){width:30%;text-align:center}
   .package-compare thead{background:#f4f7fb}
   .package-compare th:last-child,.package-compare td:last-child{background:#eff6ff}
   .package-compare tbody td:not(:first-child){font-weight:600}
   .package-compare tfoot td{border-bottom:0;vertical-align:top}
   .package-compare .package-select-btn{width:100%;margin:0;white-space:normal;padding:12px 8px;font-size:14px}
   .package-compare-note{font-size:13px;line-height:1.7;color:#52647c;margin:10px 0}
   .package-compare-hint{font-size:12px;font-weight:400;line-height:1.6;margin:8px 0 0;color:#64758b}
   @media(max-width:540px){.package-compare{font-size:12px}.package-compare th,.package-compare td{padding:12px 7px}.package-compare th:first-child,.package-compare td:first-child{width:36%}.package-compare th:not(:first-child),.package-compare td:not(:first-child){width:32%}.package-compare .package-select-btn{font-size:12px;padding:11px 6px}}
  `}</style>
  <header className="package-pro-head"><div className="package-pro-brand">IDพร้อม</div><h2 className="package-pro-title">เลือกแพ็กเกจ</h2><p className="package-pro-sub">รับรูปที่ชอบ หรือซื้อเครดิตเพื่อสร้างภาพเพิ่ม</p></header>
  <div className="package-compare-wrap">
   <table className="package-compare" aria-label="เปรียบเทียบแพ็กเกจ 79 และ 149 บาท">
    <thead><tr><th scope="col">สิทธิ์การใช้งาน</th><th scope="col">79 บาท — รับรูปนี้</th><th scope="col">149 บาท — สร้างได้ 3 ครั้ง</th></tr></thead>
    <tbody>{rows.map(([label,basic,plus])=><tr key={label}><th scope="row">{label}</th><td>{basic}</td><td>{plus}</td></tr>)}</tbody>
    <tfoot><tr><td></td><td><button className="package-select-btn" disabled={payBusy||!hasTrial} onClick={()=>startCheckout('79')}>{payBusy?'กำลังเปิด PromptPay…':'รับรูปนี้ 79 บาท'}</button>{!hasTrial&&<p className="package-compare-hint">ทดลองสร้างรูปก่อน เพื่อเลือกรับรูปนั้น</p>}</td><td><button className="package-select-btn" disabled={payBusy} onClick={()=>startCheckout('149')}>{payBusy?'กำลังเปิด PromptPay…':'สร้างได้ 3 ครั้ง 149 บาท'}</button></td></tr></tfoot>
   </table>
  </div>
  <p className="package-compare-note"><strong>แพ็ก 149 บาท ใช้เครดิตรวม 3 ครั้ง:</strong> เปลี่ยนรูปต้นฉบับและเลือกทรงผมพร้อมกัน แล้วกดประมวลผล หัก 1 เครดิตต่อครั้ง ไม่ได้แยกเป็นสร้างรูป 3 ครั้งและเปลี่ยนทรงผมอีก 3 ครั้ง</p>
  <p className="package-compare-note">เมื่อเครดิตหมด เลือกชุดได้หมวดละ 1 แบบต่อชาย/หญิง และล็อกทรงผมจนซื้อแพ็กประมวลผลเพิ่ม ภาพที่จ่ายแล้วดาวน์โหลดได้ตามเดิม ส่วนรูปที่ซื้อด้วยแพ็ก 79 บาทยังเปลี่ยนชุดและปรับแต่งได้ตามปกติ</p>
  <p className="package-compare-note">เครดิตคงเหลือเก็บไว้ใช้ในบัญชีเดิม • ประมวลผลล้มเหลว คืนเครดิต</p>
  {payMsg&&<p className="credit-pay-msg">{payMsg}</p>}
  <div className="package-secure">ชำระเงินผ่าน Stripe • รองรับ PromptPay • สิทธิ์เพิ่มหลังยืนยันการชำระเงิน</div>
 </>;
}
