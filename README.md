# Photo Compose V5 — Auto Head Scale

ฐาน: bg-remover-photo-compose-v4.zip

การเปลี่ยนแปลง:
- ใช้ IMG_20260914_135935.png ที่ผู้ใช้อัปโหลดล่าสุดเป็น uniform template จริง
- PNG ชุดเป็น RGB พื้นดำ ระบบจึง key เฉพาะพื้นดำให้โปร่งใสตอน runtime
- ไม่สร้าง/warp/แก้รายละเอียดชุด
- วัด alpha bounds ของหัวจริงหลังแยกหัว แทนการใช้ความกว้าง canvas ต้นฉบับ
- คำนวณขนาดหัวจาก collar opening + shoulder/template width
- จำกัดช่วงสัดส่วนเพื่อกันหัวใหญ่/เล็กผิดปกติ
- จัดหัวกึ่งกลางช่องคอ
- วางหัวก่อนชุด ให้ปกเสื้อทับรอยต่อบริเวณคาง/คอ
- background ใช้ไฟล์เดิมและขนาด canvas ตาม background

ยังเป็น one-click pipeline เดิม
