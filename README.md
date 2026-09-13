# PhotoID Studio TH — v2 restored from prior Work state

เวอร์ชันนี้ปรับกลับให้ตรงกับสถานะที่อนุมัติใน Work:

- UI ซ้ายเมนู / กลางพรีวิว / ขวาตัวเลือก ตามหน้าเดิม
- ชุดเริ่มต้น = สมัครงาน → สูทหญิงสุภาพ
- ใช้ไฟล์ `public/assets/suit-female-formal.jpg` เป็น reference ชุดจริง
- ทรงเริ่มต้น = ประบ่า / แบบ 20
- ผลลัพธ์ล็อกมาตรฐานรูปสมัครงาน 3:4
- พื้นหลังฟ้ามาตรฐาน
- ระยะ: เห็นช่วงตัวและความกว้างไหล่, ศีรษะไม่ซูมแน่น, มีพื้นที่เหนือศีรษะ
- มี approved result เป็น reference การจัดเฟรม
- API pipeline ถูกเตรียมไว้แล้ว แม้ยังไม่ใส่ `OPENAI_API_KEY`
- Server บังคับ crop ผล AI เป็น 1200×1600 (3:4)

## Deploy Render
Build Command:
npm install

Start Command:
npm start

ยังไม่ต้องเพิ่ม API key หากต้องการดู UI ก่อน

เมื่อพร้อมใช้ AI:
Environment → Add Environment Variable
OPENAI_API_KEY = คีย์ของคุณ

จากนั้น Save Changes / Redeploy
