# GovPhoto v5.1 Auto Head Extraction
แก้ปัญหารูปต้นฉบับเป็นกรอบสี่เหลี่ยมทับชุด:
- ผู้ใช้ไม่ต้องอัปโหลด mask
- ใช้ background-removal segmentation สร้าง alpha อัตโนมัติ
- crop ส่วนบนของ segmented person เพื่อเอาลำตัวออก
- วาง PNG โปร่งใสบน Template ชุด
- ชุด Pixel Locked และไม่ใช้ Generative AI
- AI calls = 0 ในขั้นตอนนี้

ข้อจำกัดปัจจุบัน: การหาเส้นใต้คาง/ช่องคอเป็น heuristic; Neck-only inpainting ยังไม่เปิดในไฟล์นี้
เพื่อไม่ให้ระบบอ้างว่าล็อกชุดแต่กลับส่งทั้งภาพให้ AI
