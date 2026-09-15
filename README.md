# Photo Compose V6 — Native Transparent Uniform

ฐาน: V5 Auto Head Scale

- เปลี่ยน uniform asset เป็น official-female-practitioner-finance.png ล่าสุดของผู้ใช้
- ตรวจไฟล์แล้วเป็น RGBA 2048×1731 และมี alpha 0–255 จริง
- ยกเลิก black-key/background removal ของชุดทั้งหมด
- ใช้ alpha ดั้งเดิมของ PNG โดยตรง จึงรักษาขอบชุด/ปก/บ่า/เครื่องหมาย
- ระบบปรับหัวตาม alpha bounds + collar/shoulder geometry เดิม
- Layer: background -> scaled head -> transparent uniform
- ชุดอยู่ด้านหน้าหัวเพื่อซ่อนรอยต่อบริเวณช่องคอ
