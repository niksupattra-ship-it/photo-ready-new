# Photo Compose V6 — Native Transparent Uniform

ฐาน: V5 Auto Head Scale

- เปลี่ยน uniform asset เป็น official-female-practitioner-finance.png ล่าสุดของผู้ใช้
- ตรวจไฟล์แล้วเป็น RGBA 2048×1731 และมี alpha 0–255 จริง
- ยกเลิก black-key/background removal ของชุดทั้งหมด
- ใช้ alpha ดั้งเดิมของ PNG โดยตรง จึงรักษาขอบชุด/ปก/บ่า/เครื่องหมาย
- ระบบปรับหัวตาม alpha bounds + collar/shoulder geometry เดิม
- Layer: background -> scaled head -> transparent uniform
- ชุดอยู่ด้านหน้าหัวเพื่อซ่อนรอยต่อบริเวณช่องคอ


## Hair option preparation
- เพิ่ม `public/assets/hair/hair-01.png` จาก PNG โปร่งใสที่ผู้ใช้ส่ง
- เพิ่มตัวเลือก `ทรงผม 01` ใน UI
- ขั้นนี้เป็นการเตรียม asset/selection เท่านั้น
- ยังไม่เปลี่ยนทรงผมจริงและยังไม่แก้ pipeline V6 เดิม

## AI neck + selected hair finishing
เมื่อเลือกทรงผม ระบบจะส่งภาพประกอบสุดท้าย + PNG ทรงผมที่เลือกไปยัง OpenAI image edit
- model: gpt-image-2
- input_fidelity: high
- quality: high
- ล็อก prompt ให้คง identity/geometry/eyes/skin texture/makeup/expression
- ห้าม beauty/skin smoothing/plastic look
- AI ทำเฉพาะคอสั้นธรรมชาติ + ทรงผม + เกลี่ยขอบ
- ชุด/เครื่องหมาย/พื้นหลังต้องคงเดิม
- ต้องมี OPENAI_API_KEY ใน Render

## Economy AI finishing revision
- ระบบเดิมทั้งหมดคงเดิม
- ยังใช้ภาพประกอบ + PNG ทรงผมที่เลือก
- ยังใช้ input_fidelity=high เพื่อเน้นรักษาใบหน้า/รายละเอียดต้นฉบับ
- เปลี่ยน output quality จาก high -> low เพื่อลดค่า image output อย่างมาก
- prompt ล็อกใบหน้า/ผิว/แววตา/ชุด/เครื่องหมายเหมือนเดิม
- ขั้นต่อไปหากต้องลดอีก: crop+mask เฉพาะ head/neck ROI แล้ว composite กลับ
