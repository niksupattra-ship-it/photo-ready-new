# IDพร้อม — Stripe PromptPay / Credits setup

แพ็กเกจ: 149 บาท = 2 เครดิต

## Railway Variables
ตั้งค่าใน Railway > Service > Variables:

- `STRIPE_SECRET_KEY` = Secret key ของ Stripe (ใช้ test key ตอนทดสอบ)
- `STRIPE_WEBHOOK_SECRET` = Signing secret ของ Webhook endpoint
- `STRIPE_PRICE_ID` = `price_1UKKMzJdTdkPeQBPQwtPL7kE`
- `APP_URL` = URL เว็บ IDพร้อม เช่น `https://<service>.up.railway.app`
- `PAYMENT_DATA_FILE` = `/data/payments.json`
- `OPENAI_API_KEY` = ค่าเดิมของโปรเจกต์

ห้ามใส่ `STRIPE_SECRET_KEY` หรือ `STRIPE_WEBHOOK_SECRET` ลง GitHub/ไฟล์โปรเจกต์

## Railway Volume (สำคัญ)
ระบบรุ่นนี้เก็บกระเป๋าเครดิตในไฟล์ JSON ฝั่งเซิร์ฟเวอร์เพื่อไม่เพิ่มฐานข้อมูลภายนอก
ต้องเพิ่ม Railway Volume และ mount ที่ `/data` แล้วตั้ง `PAYMENT_DATA_FILE=/data/payments.json`
ถ้าไม่ทำ ข้อมูลเครดิตอาจหายเมื่อ container ถูกสร้างใหม่

ระบบนี้เหมาะกับ Railway service 1 replica เท่านั้น หากจะ scale หลาย replica ให้ย้าย credit store ไป PostgreSQL ก่อน

## Stripe Webhook
สร้าง endpoint ใน Stripe Workbench/Webhooks:

`https://<APP_URL>/api/payments/stripe-webhook`

เลือก event:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

คัดลอก Signing secret (`whsec_...`) ไปใส่ Railway variable `STRIPE_WEBHOOK_SECRET`

## Flow
1. Browser สร้าง wallet id และเก็บไว้ใน localStorage
2. กดซื้อ 2 เครดิต 149 บาท
3. Server สร้าง Stripe Checkout Session ที่รับ PromptPay
4. Stripe ยืนยันการชำระผ่าน webhook
5. Server เติม 2 เครดิตแบบ idempotent (session เดิมเติมซ้ำไม่ได้)
6. `/api/ai-finish` และ `/api/hairstyle/edit` ตรวจและหัก 1 เครดิตฝั่ง server
7. ถ้า AI endpoint ล้มเหลว ระบบคืนเครดิตที่ reserve ไว้

## ข้อจำกัดของรุ่นนี้
เครดิตผูกกับ browser/device เดิม ยังไม่มีระบบ login/email account ดังนั้นการล้าง browser data หรือเปลี่ยนอุปกรณ์จะไม่เห็น wallet เดิม ถึงแม้ยอดฝั่ง server ยังอยู่
ก่อนเปิดขายวงกว้างควรเพิ่มระบบบัญชี/OTP เพื่อกู้เครดิตข้ามอุปกรณ์
