# Background Remover TH
โปรเจกต์ใหม่สำหรับลบพื้นหลังเท่านั้น ไม่มีระบบชุด/ทรงผม/สร้างภาพ

## หลักการ
BiRefNet ONNX สร้าง alpha mask แต่ RGB ของบุคคลนำจากไฟล์ต้นฉบับ จึงไม่มีการสร้างใบหน้าใหม่

## ติดตั้ง
1. ใช้ Node.js 20+
2. `npm install`
3. สร้างโฟลเดอร์ `models`
4. ใส่โมเดล BiRefNet ONNX ชื่อ `models/birefnet.onnx`
5. `npm run build`
6. `npm start`
7. เปิด http://localhost:3000

> โมเดลไม่ได้รวมใน ZIP เพราะมีขนาดใหญ่และมีเงื่อนไขการแจกจ่ายของเจ้าของโมเดล
> หาก ONNX ที่เลือกใช้มี input/output layout ต่างจาก [1,3,1024,1024] ให้ปรับ server.js ให้ตรงกับโมเดลนั้น

## Render
Build Command: `npm install && npm run build`
Start Command: `npm start`
ต้องทำให้ไฟล์โมเดลอยู่ใน `models/birefnet.onnx` ใน deployment ด้วย

## API
POST `/api/remove-background`
multipart field: `image`
response: PNG โปร่งใส
