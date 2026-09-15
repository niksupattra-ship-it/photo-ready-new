# Auto Head — Jaw Contour
ฐาน: bg-remover-auto-head-render-fixed.zip

Pipeline เดียว:
1. remove.bg ลบพื้นหลัง
2. MediaPipe FaceLandmarker วิเคราะห์กรอบหน้า
3. ลบคอ/ไหล่/ลำตัวด้วย alpha eraser แบบคมตามแนวใต้หู-กราม-คาง
4. แสดงผลลัพธ์สุดท้ายเท่านั้น

ไม่มีปุ่มแยกขั้นตอน และไม่ใช้ Generative AI
