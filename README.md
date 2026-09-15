# V9 Anatomical Anchor Fitting

รื้อระบบ positioning ของ V8 แล้ว

คงเดิม:
- remove.bg
- head extraction / jaw matte
- background
- transparent uniform PNG
- one-click pipeline

ใหม่:
1. Template มี anatomical anchors แบบ normalized:
   neck center, collar top/bottom, shoulder left/right, shoulder Y
2. Scale หัวจาก shoulder span เป็นหลัก
   target shoulder/head width ≈ 1.90
   clamp 1.78–2.02
3. ไม่เอาช่องคอเป็นตัวกำหนดขนาดหัวหลัก
4. สร้าง AI Neck Zone ระหว่างคางกับ collar top
   target ≈ 12–18% ของ visible head height
5. คาง/หัวจัดกลางกับ neck center
6. sanity check ระยะ shoulder-to-chin
7. เก็บ geometry ไว้ใน window.__PHOTO_GEOMETRY__
   เพื่อใช้สร้าง mask สำหรับ AI neck finishing ขั้นต่อไป
8. ไม่ warp / redraw ชุด และไม่แก้ใบหน้า

ขั้นนี้ยังไม่เรียก AI; เป็น geometry foundation สำหรับ AI เติมคอ/เกลี่ยขอบในขั้นถัดไป
