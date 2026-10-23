# IDPROM — แก้หน้าดูเครดิตยังโหลดนาน — 23 ตุลาคม 2026

อ้างอิงโปรเจ็กล่าสุด `aa0078bfdac7162094e3e3e84b87a1bef74f7e74` ซึ่งมีชุดแก้ล็อกอินก่อนหน้าแล้ว ตรวจ blob SHA ของไฟล์ชุดก่อนตรงกับ GitHub และตรวจ HEAD ซ้ำก่อนจัด ZIP

สาเหตุในโค้ด: หน้าดูเครดิตยังรอ refresh สิทธิ์เต็ม ซึ่งผ่าน schema initialization/DDL, การซ่อมสิทธิ์รายรูป และข้อมูลที่หน้าแสดงยอดไม่จำเป็นต้องรอ จึงยังหมดเวลาได้แม้ล็อกอินสำเร็จ

ชุดนี้แก้เฉพาะ 4 ไฟล์ runtime:
- payment-store.js
- server.js
- src/main.jsx
- src/studio-rights-dialog.jsx

เพิ่ม `/api/wallet/balance` อ่านยอดจริงและสิทธิ์ทดลองเท่านั้น ไม่รอ migration, reconciliation, ประวัติ หรือสิทธิ์รายรูป ใช้ read-only pool แยก max=2, รอ connection 2 วินาที, SQL สูงสุด 5 วินาที หน้าดูยอดใช้คำขอนี้โดยตรงและรอสูงสุด 8 วินาที ไม่ได้อาศัยการเพิ่ม timeout ของคำขอเดิม

`ready()` ตรวจโครงสร้างปัจจุบันด้วย SELECT ครั้งเดียว ถ้าครบแล้วข้าม DDL ทั้งหมด ถ้าเป็น schema เก่าหรือไม่ครบจะใช้ migration เดิมต่อ ไม่บังคับมี performance index ใหม่เพื่อผ่านการตรวจ

รหัสผ่าน บัญชี ราคาแพ็กเกจ จำนวนเครดิต และเส้นทางตรวจสิทธิ์ประมวลผล/ดาวน์โหลดเดิมคงไว้ ผลอ่านยอดไม่มี unlockedJobIds/editableJobIds และการรวมยอดไม่ล้างสิทธิ์เดิมหรือให้สิทธิ์รูปเพิ่ม

นำไฟล์ runtime ทั้ง 4 วางทับตามตำแหน่งเดิม แล้ว build และ restart/deploy server ตามขั้นตอนเดิม ต้องอัปเดตทั้ง client และ server พร้อมกันเพื่อให้เส้นทาง `/api/wallet/balance` พร้อมใช้งาน ไม่ต้องเพิ่ม dependency หรือเปลี่ยน environment variable

ไฟล์ scripts/check-credit-balance-view.mjs เป็นชุดตรวจใหม่ รันด้วย `node scripts/check-credit-balance-view.mjs` ส่วน README และ VERIFY เป็นเอกสารประกอบ

ผลตรวจ: build ผ่านด้วย dependency ตรง package-lock, client ใหม่ 7 กรณี, login เดิม 18 กรณี, server ใหม่ 10 กรณีรวม SQL บน PostgreSQL WASM และ server เดิม 23 กรณีรวม trial 210 เงื่อนไข ผ่าน

Chromium/WebKit ผ่านกรณี rich refresh ค้างไม่สิ้นสุดแต่หน้าดูยอดตอบได้, ยอดเดิมระหว่างรอ, error/retry, สลับบัญชี และคำตอบเก่าไม่ทับยอดหลังชำระ/ใช้เครดิต ไม่มี JavaScript page errors ใน fixture

ไม่ใช้รหัสผ่านลูกค้าหรือเขียนข้อมูล production ชุดนี้ยังไม่ได้ deploy และไม่มี log ฐานข้อมูลจริง จึงยังระบุไม่ได้ว่า incident จริงติด DDL, index หรือ transaction ใด หากยังมีข้อผิดพลาดหลัง deploy ให้ตรวจ log `Wallet balance:` และรหัสข้อผิดพลาดฐานข้อมูล โดยไม่ส่งรหัสผ่านหรือ token
