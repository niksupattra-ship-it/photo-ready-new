# GovPhoto v5 — Head Cutout + Auto Proportion + Neck Zone

โครงสร้างตามที่กำหนด:
1. รูปบุคคล -> head/hair layer (รองรับ mask)
2. Template ชุด -> Pixel Locked, ไม่ผ่าน Generative AI
3. Auto proportion -> คำนวณจาก shoulder/head ratio เป้าหมาย 2.15
4. Auto placement -> จัดศูนย์หัวเข้าช่องคอ
5. Neck zone -> สร้างกรอบเฉพาะพื้นที่คอสำหรับ inpainting
6. Final composite -> 900x1200

สำคัญ:
- เวอร์ชันนี้ทำ deterministic compositing จริงและกำหนด neck-only zone แล้ว
- ENABLE_NECK_AI ปิดเป็นค่าเริ่มต้น
- ยังไม่ได้อ้างว่ามี Photoshop Select Subject จริง: การตัดผมคุณภาพ production ต้องต่อ segmentation/matting engine
- ยังไม่ได้ส่ง neck patch เข้า Generative API เพราะต้องใช้ endpoint/workflow ที่รับเฉพาะ crop+mask แล้วคืนเฉพาะ patch เพื่อรับประกันว่าชุดไม่ถูกแตะ
- ห้ามส่งทั้งภาพเข้า Generative AI ในรุ่น production
