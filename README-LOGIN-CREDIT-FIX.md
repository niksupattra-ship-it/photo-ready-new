# IDPROM — แก้เข้าสู่ระบบและโหลดเครดิต — 23 ตุลาคม 2026

อ้างอิง GitHub nik su pattra: `niksupattra-ship-it/photo-ready-new` commit `3c9896abcba2a3697e713d5f0905d1bced85d469` (23 ต.ค. 2026 เวลา 17:20 น. ประเทศไทย) ตรวจซอร์ส 152 ไฟล์ตรงกับ Git blob ของ commit นี้ และยืนยัน HEAD อีกครั้งก่อนจัดชุดแก้

## สาเหตุที่พบ

1. เดิม login รอตรวจรหัสผ่าน สร้าง session แล้วจึงรอข้อมูลเครดิตและสิทธิ์ทดลองก่อนส่ง token; client จำกัดเวลาที่ 15 วินาที และปฏิเสธผล login ที่ไม่มีข้อมูลเครดิต แม้ยืนยันบัญชีสำเร็จแล้ว
2. การ refresh เครดิตเรียก `/auth/me` แล้ว `/wallet` ต่อกัน ขณะที่หลายจุดเรียกพร้อมกัน และ `/wallet` รวมประวัติที่หน้าเครดิตไม่จำเป็นต้องรอ
3. คำขอเก่าอาจเขียนทับบัญชีใหม่หรือยอดใหม่หลังซื้อ/ใช้เครดิต โดยเฉพาะ POST สร้าง guest wallet ที่ยังไม่ตรวจ identity หลังตอบกลับ
4. การชำระ/รับเครดิตโปรโมชันถือ connection หลัง COMMIT แล้วรออ่านสิทธิ์ผ่าน pool อีกครั้ง จำลอง 10 คำขอพร้อมกันแล้ว pool เต็มและงานรอกันเอง
5. initialization ของ auth/payment จำ error ครั้งแรกไว้ตลอด process; ตรวจสิทธิ์ทดลองเดิมมี 3 SQL round trips และเงื่อนไข OR ที่อาจ scan ตาราง

## ผลของชุดแก้

- client ใหม่ขอ `sessionOnly:true`: ตอบบัญชีที่ยืนยันแล้วโดยไม่รอข้อมูลเครดิต; client เดิมยังรับ login response แบบเดิมได้
- แสดงว่าเข้าสู่ระบบสำเร็จก่อนรอเครดิต/ย้ายรูปทดลอง ส่วนการชำระหรือรับโปรโมชันที่ค้างไว้ต้องรอย้ายรูปสำเร็จก่อนเสมอ
- อ่านเครดิตผ่าน `/api/wallet?summary=1` ร่วมกันหนึ่งคำขอในช่วงเดียวกัน พร้อม timeout และปุ่มลองใหม่; ข้อมูลที่ยังไม่ทราบไม่แสดงเป็นยอดศูนย์ในหน้าดูเครดิต
- dialog ใช้ยอดล่าสุดที่ตรวจสอบแล้วทันทีและอัปเดตเบื้องหลัง ป้องกันข้อมูลจากบัญชีเก่าและก่อนซื้อ/ใช้เครดิตเขียนทับยอดปัจจุบัน
- คืน connection ก่อนอ่านสิทธิ์เพิ่มเติม, กำหนดเวลารอ connection 5 วินาที, retry initialization หลัง transient failure และตรวจรหัสผ่านแบบ async โดยยังใช้ hash เดิม
- ตรวจสิทธิ์ทดลองด้วย SQL เดียวและ UNION ที่นับแต่ละ trial เพียงครั้งเดียว เพิ่มดัชนี 4 ตัวแบบ CONCURRENTLY โดยไม่เปลี่ยนกฎ 2 ครั้งต่อวันตามเวลาไทย

ราคาแพ็กเกจ จำนวนเครดิต การหัก/คืนเครดิต และกฎสิทธิ์เดิมคงไว้ ไม่แก้ภาพ ทรงผม ชุด หรือเครื่องมือแต่งภาพ

## ติดตั้ง

นำไฟล์ 6 ไฟล์นี้วางทับตามตำแหน่งเดิมพร้อมกัน:

- `auth-store.js`
- `payment-store.js`
- `server.js`
- `src/main.jsx`
- `src/studio-rights-dialog.jsx`
- `src/wallet-refresh.js` (ไฟล์ใหม่)

จากนั้น build และ restart/deploy server ตามขั้นตอนเดิมของโครงการ ไม่ต้องเพิ่ม dependency หรือแก้ environment variables

ไฟล์ `scripts/check-login-wallet.mjs` เป็นชุดทดสอบใหม่ ใช้ `node scripts/check-login-wallet.mjs`; README และ VERIFY เป็นเอกสารประกอบ ไม่ใช่ไฟล์ runtime

ดัชนีใหม่สร้าง CONCURRENTLY นอก transaction; หาก deployment ถูกหยุดระหว่างสร้าง ให้ผู้ดูแลตรวจ `pg_index.indisvalid` ของ `payments_wallet_created_idx`, `promo_redemptions_wallet_created_idx`, `credit_usage_wallet_created_idx`, `trial_previews_wallet_created_idx` ก่อนซ่อมเฉพาะดัชนีที่ไม่ valid การสร้างครั้งแรกยังอาจเพิ่มเวลาอ่านเครดิตระหว่างเตรียม schema

## ผลตรวจและข้อจำกัด

- build ผ่าน 117 modules (มีคำเตือนขนาด bundle เดิม)
- client 18 กรณีผ่าน: login ไม่รอเครดิต, invalid credentials, เปลี่ยนบัญชี/guest ABA/401/404, request dedup, เครดิตหลังจ่ายและหักใช้, claim รูปทดลองและ retry ก่อนชำระ
- server 23 กรณีผ่าน รวม SQL บน PostgreSQL WASM, เทียบกฎ trial เดิม 210 กรณีใน 3 timezone รอบเที่ยงคืนไทย, replay การชำระ 89/159 ไม่เพิ่มเครดิตซ้ำ, pool 10 connection และ password hash เดิม
- Chromium และ WebKit: login ก่อนเครดิตตอบ, dialog ร่วมคำขอเดียว, ยอดเดิมระหว่างโหลด, error/retry และเปลี่ยนบัญชี ผ่าน ไม่มี JavaScript page errors ใน fixture
- ตรวจสิทธิ์ดาวน์โหลดรูปที่ซื้อ/โปรโมชันแล้วแม้เครดิตศูนย์ผ่าน โดยปรับเฉพาะ dependency ของ test fixture และข้อความ UI ที่สคริปต์เดิมคาดหวังล้าสมัยในชุดทดสอบชั่วคราว
- สคริปต์เดิม 3 รายการมี fixture/ข้อความที่ล้าสมัยและล้มเหลวบน baseline ด้วย: output-rights, promo-reopen, hairstyle-trial-confirmation; ไม่แก้ production ที่ไม่เกี่ยวข้องเพื่อทำให้สคริปต์เหล่านั้นผ่าน

ตรวจ production แบบอ่านอย่างเดียว: หน้าเว็บและ health ตอบกลับได้ในเวลาที่ตรวจ ไม่ได้ใช้รหัสผ่านลูกค้า ไม่ได้ตรวจล็อกฐานข้อมูล production ไม่ได้ชำระ/แก้เครดิตจริง จึงไม่ยืนยันว่า incident ของลูกค้าเกิดจาก DB lock ชนิดใดโดยไม่มี log จริง

ชุดนี้ยังไม่ได้ push/deploy ขึ้นเว็บไซต์จริง รายละเอียดผลตรวจอยู่ใน `VERIFY-LOGIN-CREDIT.json`
