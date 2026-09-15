# BG Remover — Render Ready

เวอร์ชันนี้ไม่ต้องใช้ไฟล์ birefnet.onnx และไม่ต้องติดตั้งโมเดลบน Render

## ตั้งค่า Render
Build Command:
npm install && npm run build

Start Command:
npm start

Environment Variable:
REMOVEBG_API_KEY = API key จาก remove.bg

หลังเพิ่ม Secret แล้ว Redeploy

## การทำงาน
Browser -> Backend ของเรา -> remove.bg API -> PNG โปร่งใส

API key อยู่เฉพาะฝั่ง server และไม่ถูกส่งไป browser
