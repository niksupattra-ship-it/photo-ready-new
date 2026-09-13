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
