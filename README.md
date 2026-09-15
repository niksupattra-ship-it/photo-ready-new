# Jaw Matte V3
ฐาน: bg-remover-auto-head-jaw-contour-v2.zip

ปรับเฉพาะขั้นตอนหลัง remove.bg:
- MediaPipe ใช้หา ROI ของกราม ไม่ใช้ landmark เป็นเส้นตัดสุดท้าย
- ค้นหา alpha contour จริงจาก PNG ของ remove.bg ใน ROI
- median-filter contour ลดขอบกระโดด
- coverage anti-alias ประมาณ 1px
- edge RGB decontamination เฉพาะ pixel กึ่งโปร่งใส ลด halo
- RGB ใบหน้าส่วนทึบไม่ถูกแก้ และไม่ใช้ Generative AI

Pipeline ยังเป็นคลิกเดียว: remove.bg -> jaw matte -> head-only PNG
