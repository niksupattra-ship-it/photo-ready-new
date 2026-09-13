# PhotoID Studio TH — v5 Reference-Locked Pipeline

เวอร์ชันนี้เปลี่ยนหลักการสร้างภาพให้ตรงกับการทดสอบในแชท:

1. รูปที่ผู้ใช้อัปโหลด = แหล่งใบหน้า/ตัวตนเพียงแหล่งเดียว
2. การ์ดชุดที่เลือก = ส่ง "ไฟล์รูปชุดจริง" เข้า AI และใช้เป็นทั้งแบบชุด + ระยะช่วงตัว/ไหล่/คอ
3. ทรงผม 01–29 = ส่ง `hair-XX.png` ตัวจริงเข้า AI ทุกครั้ง ไม่ใช้ชื่อทรงเพื่อเดา
4. พื้นหลัง = ใช้ตัวเลือกเดียวกับหน้าเว็บ
5. ส่งเข้า OpenAI Images Edit ตามลำดับ:
   - IMAGE 1 customer identity
   - IMAGE 2 selected outfit reference
   - IMAGE 3 selected hairstyle reference
6. Prompt ห้าม AI นำหน้า/ผิว/เมกอัพจากรูปชุดหรือรูปผมมาใช้
7. Output ถูกบังคับเป็น 1200×1600 (3:4)

ตัวอย่าง:
`รูปคน + shirt-woman + 07 + blue`
จะส่ง:
- รูปคนจริง
- `assets/ui/outfit-07.jpg`
- `assets/hairstyles/hair-07.png`

ดังนั้น “แบบ 07” ไม่ได้แปลเป็นข้อความบรรยายทรงผม แต่ใช้ไฟล์ `hair-07.png` จริง


## v6 strict hairstyle reference mode

กฎใหม่:
- แบบ 01 ต้องใช้ `hair-01.*`
- ...
- แบบ 29 ต้องใช้ `hair-29.*`
- Backend ต้องพบไฟล์ของหมายเลขที่เลือกเพียง 1 ไฟล์เท่านั้น
- ถ้าหาย/ซ้ำ/เลขผิด ระบบ error ทันที
- ห้าม fallback ไปใช้ prompt บรรยายทรงผม
- IMAGE 3 เป็น authoritative hairstyle reference
- หน้าและตัวตนยังมาจาก IMAGE 1 เท่านั้น
- ชุดและระยะช่วงตัวมาจาก IMAGE 2


## v7 — Master Framing Locked

เพิ่ม `public/assets/master-framing-3x4.png` เป็น IMAGE 4

หน้าที่ของ IMAGE 4:
- ล็อกขนาดศีรษะ
- ล็อกตำแหน่งศีรษะ
- ล็อกพื้นที่เหนือศีรษะ
- ล็อกตำแหน่งคอ
- ล็อกระดับและความกว้างไหล่
- ล็อกขนาดช่วงตัว
- ล็อกระยะกล้อง/การซูม
- ทุกชุดและทุกทรงผมต้องใช้ระยะเดียวกัน

ลำดับ reference:
1. IMAGE 1 = ใบหน้า/ตัวตนจริง
2. IMAGE 2 = ชุดที่เลือก
3. IMAGE 3 = hair-XX ที่เลือก
4. IMAGE 4 = Master Framing 3:4

ห้าม IMAGE 4 มีผลต่อใบหน้า ทรงผม หรือชุด


## v8 — Preserve Master Framing / No Crop

ปรับ post-process หลัง AI สร้างภาพ:
- เดิม: `fit: "cover"` อาจครอปหัว/ไหล่/ช่วงตัว
- ใหม่: `fit: "contain"` ไม่ครอปภาพ
- เติมพื้นที่ที่เหลือด้วยฟ้ามาตรฐาน
- เป้าหมายคือรักษา Master Framing ให้ใกล้กับผลจาก AI มากที่สุด
- Output ยังคง 1200×1600 (3:4)


## v9 — Strict Identity Lock Prompt

เงื่อนไขทั้งหมดถูกเขียนลง prompt จริงก่อนเรียก AI แล้ว:
- IMAGE 1 = ใบหน้า/ตัวตนเพียงแหล่งเดียว
- ห้ามสร้างหน้าใหม่หรือ beautify
- ห้ามเปลี่ยนตา จมูก ปาก รูปหน้า กราม สีผิว เมกอัพ อายุ สีผิว texture
- IMAGE 2 = ชุดเท่านั้น
- IMAGE 3 = ทรงผมเท่านั้น
- original hair = ห้ามเปลี่ยนทรงผม
- IMAGE 4 = ระยะภาพเท่านั้น
- แก้ได้เฉพาะ ชุด ผม (เมื่อเลือกเปลี่ยน) คอ รอยต่อ ไหล่ พื้นหลัง แสง และขอบ
- มี AI_PREFLIGHT log ก่อนส่ง request เพื่อเช็กว่าเลือกไฟล์ reference ตัวไหนจริง
- Health endpoint แสดง promptVersion = v9-identity-lock
