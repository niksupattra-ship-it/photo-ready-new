# Photo Compose V6 — Native Transparent Uniform

ฐาน: V5 Auto Head Scale

- เปลี่ยน uniform asset เป็น official-female-practitioner-finance.png ล่าสุดของผู้ใช้
- ตรวจไฟล์แล้วเป็น RGBA 2048×1731 และมี alpha 0–255 จริง
- ยกเลิก black-key/background removal ของชุดทั้งหมด
- ใช้ alpha ดั้งเดิมของ PNG โดยตรง จึงรักษาขอบชุด/ปก/บ่า/เครื่องหมาย
- ระบบปรับหัวตาม alpha bounds + collar/shoulder geometry เดิม
- Layer: background -> scaled head -> transparent uniform
- ชุดอยู่ด้านหน้าหัวเพื่อซ่อนรอยต่อบริเวณช่องคอ


## Hair option preparation
- เพิ่ม `public/assets/hair/hair-01.png` จาก PNG โปร่งใสที่ผู้ใช้ส่ง
- เพิ่มตัวเลือก `ทรงผม 01` ใน UI
- ขั้นนี้เป็นการเตรียม asset/selection เท่านั้น
- ยังไม่เปลี่ยนทรงผมจริงและยังไม่แก้ pipeline V6 เดิม

## AI neck + selected hair finishing
เมื่อเลือกทรงผม ระบบจะส่งภาพประกอบสุดท้าย + PNG ทรงผมที่เลือกไปยัง OpenAI image edit
- model: gpt-image-2
- input_fidelity: high
- quality: high
- ล็อก prompt ให้คง identity/geometry/eyes/skin texture/makeup/expression
- ห้าม beauty/skin smoothing/plastic look
- AI ทำเฉพาะคอสั้นธรรมชาติ + ทรงผม + เกลี่ยขอบ
- ชุด/เครื่องหมาย/พื้นหลังต้องคงเดิม
- ต้องมี OPENAI_API_KEY ใน Render

## Economy AI finishing revision
- ระบบเดิมทั้งหมดคงเดิม
- ยังใช้ภาพประกอบ + PNG ทรงผมที่เลือก
- ยังใช้ input_fidelity=high เพื่อเน้นรักษาใบหน้า/รายละเอียดต้นฉบับ
- เปลี่ยน output quality จาก high -> low เพื่อลดค่า image output อย่างมาก
- prompt ล็อกใบหน้า/ผิว/แววตา/ชุด/เครื่องหมายเหมือนเดิม
- ขั้นต่อไปหากต้องลดอีก: crop+mask เฉพาะ head/neck ROI แล้ว composite กลับ

## Compatibility fix
- ลบ input_fidelity parameter ออกจาก gpt-image-2 เพราะ endpoint/model นี้ตอบกลับว่าไม่รองรับ
- quality=low ยังคงเดิม
- prompt รักษาใบหน้า/ผิว/แววตา/ชุดยังคงเดิม
- pipeline อื่นไม่เปลี่ยน

## Adaptive Head-to-Body Fit
- ยึด template ชุดและช่วงไหล่เป็นมาตรฐานหลัก
- วัด alpha bounds ของหัวจริง จึงไม่ใช้ขนาด canvas/ระยะซูมต้นฉบับ
- head width = 78% shoulder-based target + 22% collar constraint
- shoulder/head target เริ่มที่ประมาณ 1.88 และปรับเล็กน้อยตาม aspect ของหัว
- clamp ความกว้างหัวไว้ 40.5–48.5% ของความกว้าง template
- ขยายหัวมากกว่าเวอร์ชันก่อน แต่ยังยืดหยุ่นกับคน/ระยะภาพที่ต่างกัน
- ลด vertical down-offset จาก 13.5% เป็น 10.5% เพื่อไม่ให้คอสั้นเกินเมื่อหัวใหญ่ขึ้น
- AI neck/hair economy pipeline อื่นคงเดิม

## Adaptive Head Fit v2
แก้จากผลทดสอบจริงที่ v1 ทำหัวใหญ่เกิน:
- ยกเลิก shoulder/head target 1.88 และ blend 78/22
- กลับไปยึด collar opening ของ template เป็น baseline
- ใช้ alpha bounds เพื่อ normalize ความต่างของภาพต้นฉบับ
- aspect correction จำกัดเพียง ±3.5%
- จำกัดความกว้างหัว 30–36% ของความกว้าง template
- vertical offset = 12.5% เพื่อรักษาระยะคอ
- AI finishing / hair / background / uniform / economy settings คงเดิม


## Adaptive Head Fit v3 - proportion correction
- เพิ่ม head target จาก collar x2.02 เป็น x2.28
- จำกัด visible head width ที่ 34.5–39.5% ของความกว้างชุด (เดิม 30–36%)
- ลด headDownOffset 12.5% -> 10.5% เพื่อไม่ให้คอสั้น/หัวจมปกเมื่อขยายหัว
- เหตุผล: ผลทดสอบจริง v2 มี shoulder-to-head ratio สูงเกิน ทำให้หัวดูเล็กกว่าลำตัว

## V9 — Head / New-Neck / Template Geometry
- ตัดต้นฉบับถึงแนวกรามและทิ้งคอเดิมทั้งหมด
- ไม่ใช้ระยะภาพต้นฉบับกำหนดขนาดหัว
- ใช้ shoulder anchor ของ uniform template เป็นมาตรฐาน: head width = shoulder span / 2.16 (ปรับตาม shape เล็กน้อย)
- จำกัดหัวไว้ 37.5–41.5% ของความกว้าง template เพื่อกันหัวเล็ก/ใหญ่ผิดธรรมชาติ
- เว้นช่องใต้คางใหม่ตามขนาดหัว แล้วให้ AI สร้างคอใหม่ทั้งหมด
- คอใหม่ต้องสัมพันธ์กับทั้งกรามและช่องคอชุด ไม่อ้างอิงคอเดิม
- ชุด PNG, อินทรธนู, เข็ม, เนกไท, กระดุม และ framing ไม่เปลี่ยน


## V13 — Collar-Gap Lock
- เลิกเว้นช่องคอ 2.8–4.0% ของความสูงภาพแบบ V12
- เลื่อนหัวที่ normalize แล้วลงหา collar โดยตรง
- ช่องจากคางถึงขอบคอชุดเหลือเพียง 1.2–1.8% ของความสูงภาพ และถูกจำกัดด้วย face width อีกชั้น
- ระยะนี้อิง template เท่านั้น ไม่อิงระยะถ่าย/คอ/ลำตัวของต้นฉบับ
- AI เติมเฉพาะสะพานคอสั้น ๆ และถูกห้ามยกหัวขึ้นเพื่อสร้างคอยาว


## V14 — Real Center Collar Socket
- แก้สาเหตุคอยาว: เวอร์ชันก่อนใช้ขอบทึบแถวแรกของ PNG ซึ่งจริง ๆ คือยอดปก/บ่า ไม่ใช่ช่องคอกลาง
- V14 ตรวจ alpha เฉพาะกึ่งกลาง template เพื่อหา collar socket จริง แล้ว anchor คางจากจุดนี้
- Normalize ขนาดใบหน้าจาก eye/face landmarks เหมือนกันทุก input และเพิ่ม canonical head scale เล็กน้อย
- AI เติมเฉพาะช่องคอสั้นที่กำหนดไว้ ไม่สามารถสร้างคอยาวจากพื้นที่ว่างขนาดใหญ่ได้


## V16 — Head/Neck Pre-Placement Lift

- ต่อจาก V15 โดยแก้เฉพาะตำแหน่งก้อนหัว+คอก่อนขั้น balance ถัดไป
- ยกก้อนหัวขึ้นจาก collar socket โดยคง scale เดิม ไม่ยืดหน้า ไม่ยืดคอ และไม่เปลี่ยนชุด
- บังคับให้มี visible clearance ระหว่างใต้คางกับขอบช่องคอประมาณ 2.2–3.2% ของความสูง canvas (ปรับตามความกว้างใบหน้าในช่วงที่จำกัด)
- ตำแหน่งอิง template/collar socket จึงไม่ขึ้นกับว่ารูปต้นฉบับเป็น close-up, ครึ่งตัว หรือถ่ายไกล
- ขั้นนี้เป็นการ 'วางไว้ก่อน' ตามสเปก: ยังไม่เพิ่มการปรับ scale/shoulder balance รอบใหม่

## V18 photorealistic finishing
- Keeps V17 geometry/placement unchanged.
- AI may create only the short missing neck bridge and selected hairstyle outside the protected face.
- Strong original-skin lock: pores, marks, uneven tone, highlights, shadows and camera grain must remain photographic; no beauty/plastic skin.
- Face restoration mask uses a slightly wider local feather to hide cutout halos while restoring original face pixels after AI finishing.


## V19 professional-camera skin/detail finish
- Keeps V18 geometry, head placement, neck bridge, hairstyle and face identity lock unchanged.
- Restores the normalized ORIGINAL face pixels after AI finishing, then applies only a restrained micro-contrast lift to those original pixels so pores and genuine skin texture remain crisp.
- AI prompt now requires coherent natural photographic lighting on generated neck/hair transitions and explicitly rejects plastic skin, beauty smoothing, HDR/clarity halos, fake gloss, bloom and CGI rendering.
- No whitening, face reshaping, makeup enhancement or synthetic skin detail.
