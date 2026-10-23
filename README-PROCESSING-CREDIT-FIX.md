# IDPROM — แก้ตัวตรวจ schema และขั้นตอนเริ่มประมวลผล — 23 ตุลาคม 2026

อ้างอิง GitHub ล่าสุด `9d8b16a9303f8e964a6256753ac5dc85d2b12b55` ซึ่ง compare แล้วมี tree เหมือน `6f7e3bff33341b54ce099b886eea1dd8bbf83a53` ทุกไฟล์ โครงสร้างชุดแก้เครดิตก่อนหน้าอยู่ใน baseline นี้แล้ว

## สิ่งที่ยืนยันได้

ตรวจเว็บจริงแบบอ่านอย่างเดียวพบ health ตอบ 200 และอ่านงานที่ไม่มีอยู่ตอบ 404 ในประมาณ 0.48 วินาที แต่ endpoint อ่านเครดิตของ wallet ทดสอบที่ไม่มีอยู่ตอบ 503 สองครั้งในประมาณ 5.38/5.49 วินาที จึงมีปัญหาเฉพาะทางอ่านข้อมูลเครดิตจริง ยังระบุ SQL ที่ติดบน production ไม่ได้จาก log ที่ได้รับ

ทดสอบ PostgreSQL WASM แล้วพบข้อผิดพลาดในตัวตรวจ schema รุ่นก่อน: credit_usage.status ที่เป็น varchar(32) ให้ constraint definition ต่างจาก text ทั้งที่กฎสถานะเท่ากัน ตัวตรวจเดิมจึงไม่ยอมรับและสั่ง migration ซ้ำ แม้ migration เสร็จแล้วก็ยังตรวจไม่ผ่าน สิ่งนี้เป็น code bug ที่ยืนยันได้ ไม่ได้ยืนยันว่าฐาน production ใช้ varchar เพราะยังไม่ได้เข้าถึง schema จริง

ขั้นตอนก่อนเริ่ม AI เดิมรอ rich wallet refresh แล้วเรียก /api/wallet อีกครั้งโดย fetch ที่ไม่มี timeout ทำให้คำขอเริ่มงานติดรอได้โดยยังไม่เข้า AI

SIGTERM ในภาพหมายถึง process ถูกสั่งหยุด ส่วน OTLP export เป็นระบบส่ง telemetry ทั้งสองข้อความยังไม่แสดงเหตุของงานภาพที่ล้มเหลวโดยตรง

## การแก้

- ตรวจ constraint ให้รองรับรูปแบบ text/varchar ที่มีความหมายตรงกับ reserved/completed/refunded เดิมอย่างเข้มงวด ไม่ยอมรับสถานะเพิ่มหรือเงื่อนไขกว้างขึ้น
- ตรวจ table/column/index/constraint เป็นรายส่วนก่อน DDL ข้ามคำสั่งที่ไม่มีสิ่งต้องเปลี่ยน จึงไม่ล็อก wallets/payments ซ้ำเมื่อขาดเพียง trial index
- ข้ามการแก้ข้อมูลสถานะเมื่อ constraint เดิมถูกต้องแล้ว
- อ่าน wallet counter ก่อน ถ้าไม่มี wallet คืน not-found ทันที ไม่รอ SQL ทดลอง; หากอ่านล้มเหลวจะแยกขั้น wallet_counter / trial_policy และ SQLSTATE โดยไม่บันทึกข้อมูลลูกค้าหรือ SQL parameters
- เริ่มประมวลผลด้วยคำขอ /api/wallet/balance เดียว จำกัด 8 วินาที ตรวจความถูกต้องและบัญชี ก่อนใช้เงื่อนไข paid/trial เดิม (guest ใหม่เท่านั้นที่ต้องสร้าง wallet ก่อน)
- แสดงสถานะตรวจเครดิตในบรรทัดเดิม ป้องกันกดซ้ำ ปลดสถานะเครื่องมือเมื่อผิดพลาด และแจ้งข้อผิดพลาดชัดเจน ไม่บังหน้าตัดสินใจใช้เครดิตทดลอง
- เพิ่ม log ขั้น AI submit: reserve_credit → persist_job → queued/rejected พร้อมเวลาและ error code เพื่อแยกจุดล้มเหลวหลัง deploy

## ไฟล์ที่ต้องอัปเดต

วาง runtime 4 ไฟล์ตามตำแหน่งเดิมพร้อมกัน:

- payment-store.js
- server.js
- src/main.jsx
- src/studio-editor.jsx

จากนั้น build และ restart/deploy แอปตามขั้นตอนเดิม เพื่อให้คำขอของ process เก่าที่รออยู่ถูกยกเลิกด้วย ไม่ต้องล้างฐานข้อมูล รีเซ็ตบัญชี หรือแก้ค่าเครดิต

scripts/check-process-credit-preflight.mjs เป็นชุดตรวจใหม่ รัน `node scripts/check-process-credit-preflight.mjs` เอกสาร README/VERIFY ไม่ใช่ runtime

## ผลตรวจ

- build ผ่านด้วย dependency ตาม package-lock: 117 modules
- preflight ใหม่ 12 กรณี, login 18, credit view 7 ผ่าน
- schema PostgreSQL WASM จริง 11 กรณี: text/varchar, ขาด trial index/column, constraint ผิด, ข้าม DDL ของ wallets/payments, unknown wallet และแยก SQL timeout แต่ละช่วง
- AI-submit handler mocks 8 กรณี: paid/trial รับงาน 202, ปฏิเสธสิทธิ์, บันทึกงานล้มเหลวคืน reservation และไม่สร้างงานซ้ำ
- ชุดการเงินเดิม 23 กรณีผ่าน รวม trial 210 เงื่อนไขและ replay ชำระเงินไม่เพิ่มเครดิตซ้ำ
- Chromium/WebKit ตรวจล็อกอินและเครดิตผ่าน ไม่มี page errors ใน fixture

บัญชี รหัสผ่าน ราคา กฎสิทธิ์ และอัลกอริทึมประมวลภาพเดิมคงไว้ ตรวจไฟล์ auth-store/package-rules/job-store/output-rights/production-portrait-pipeline ว่าเหมือน baseline และส่วนเพิ่ม/หัก/คืนเครดิตยังผ่าน regression tests

ยังไม่ได้ใช้บัญชีลูกค้าหรือเรียก AI เสียเงิน จึงยังไม่ยืนยันว่ารูปจริงทุกกรณีจะผ่าน หรือ popup เดิมเกิดจากข้อผิดพลาดก่อน/หลัง AI จุดใด ชุดนี้ยังไม่ได้ push/deploy ขึ้นเว็บจริง หากยังผิดพลาดหลังอัปเดต log `AI submit`, `AI stage`, `AI job` และ `Wallet balance` จะช่วยระบุขั้นตอนโดยไม่ต้องจำข้อความเดิม
