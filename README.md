# GovPhoto Auto v3 Economy
คงเงื่อนไข v2: Identity Lock, Uniform Lock, Hair Reference, Proportion Lock, พื้นหลังฟ้า, 3:4 และ 900×1200px

## ประหยัดเครดิต
- เรียก Generative Image API สูงสุด 1 ครั้งต่อการกดสร้าง
- Resize/Export 900×1200 ทำด้วย Sharp ในเซิร์ฟเวอร์ ไม่มี AI call เพิ่ม
- ไม่มี retry อัตโนมัติที่กินเครดิตซ้ำ
- รูปทรงผมเป็น optional: ไม่ส่งก็ไม่เพิ่ม input image

หมายเหตุ: รุ่นนี้ลดจำนวนการเรียก API โดยไม่ตัดเงื่อนไขภาพออก แต่ Generative Image API ยังมีค่าใช้จ่าย 1 ครั้งต่อรูป
