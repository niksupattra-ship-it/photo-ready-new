# Photo Compose V7 — Auto Neck Fit

ฐาน: V6 Transparent Uniform

แก้เฉพาะการวางหัว/ระยะคอ:
- หัว scale จากความกว้าง alpha bounds เทียบกับช่องคอเหมือนเดิม
- เปลี่ยน vertical anchor ให้ยึด "คาง -> ปกเสื้อ" โดยตรง
- คำนวณระยะคอที่มองเห็นจาก collar opening + visible head height
- clamp ระยะคอเพื่อไม่ให้คอยาวผิดสัดส่วน
- ไม่ยกหัวตามความสูง canvas ของรูปต้นฉบับ
- ชุด PNG โปร่งใสยังวางทับหัวด้านหน้าเพื่อซ่อนรอยต่อ
- ไม่แก้หน้า ไม่แก้ชุด ไม่ warp template

Pipeline อื่นของ V6 คงเดิมทั้งหมด
