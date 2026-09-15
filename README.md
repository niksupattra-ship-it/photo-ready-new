# Photo Compose V8 — Head / Shoulder / Collar Geometry

ฐาน: V7 Auto Neck Fit

ปัญหาจากผลทดสอบ 1128×1536:
- head-only จบที่คางและไม่มี neck pixels
- V7 วางช่องคอต่ำเกินไป จึงเห็นพื้นหลังฟ้าระหว่างคางกับปกเหมือนคอยาว/หัวลอย

V8:
- วัด visible head alpha bounds
- ใช้ visible head height เป็น headUnit
- คำนวณ collarTop, collarBottom, collarDepth และ shoulderY จาก template
- เป้าหมาย shoulder อยู่ ~0.20–0.27 head-height ต่ำกว่าคาง
- เพราะ head-only ไม่มีคอ จึงให้ปกซ้อนใต้คางเล็กน้อย ~1.5–3% head-height
- เลื่อนระดับชุดขึ้นจาก V7 เพื่อให้ช่องคอรับกับหัว
- scale หัวยังอิง collar opening/shoulder width และมี clamp ป้องกันหัวใหญ่/เล็ก
- Layer: background -> head -> transparent uniform
- ไม่แก้ใบหน้า ไม่ warp ชุด

หมายเหตุ: หากต้องการเห็นคอจริงอย่างเป็นธรรมชาติ ขั้นถัดไปควรเก็บ short-neck pixels จากภาพต้นฉบับหรือใช้ AI finishing เฉพาะรอยต่อ
