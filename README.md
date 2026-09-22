# V197 — Continuous natural neck skin

- ยกเลิกการทำซ้ำแถบผิวคอสั้น ๆ ที่ทำให้เงา จุดสี และรอยผิวถูกขยายเป็นกระดำกระด่าง
- สร้างสีผิวคอเป็นสนามสีต่อเนื่องจากช่วงคอจริง พร้อมรักษาทิศทางแสงซ้าย–ขวาของภาพต้นฉบับ
- ปรับสมดุลสีแต่ละแนวลงจากจุดเชื่อมคอ ลดปื้นมืด ปื้นแดง และความต่างสีตามแนวตั้ง
- เก็บรายละเอียดผิวจริงเฉพาะระดับละเอียดและจำกัดความแรง ไม่ขยายไฝ เงาคอเสื้อ หรือบล็อกภาพเป็นรอยใหญ่
- คงขอบคอ–ไหปลาร้าแบบโปร่งใสและการซ้อนทับช่วงบนเพื่อให้รอยต่อกับคอจริงต่อเนื่อง
- ไม่เรียก AI เพิ่ม และพรีวิวกับดาวน์โหลดใช้ผลเดียวกัน

# V196 — Safety-block resilient processing

- ลดโอกาสเกิด output safety block ด้วย prompt แบบภาพติดบัตรผู้ใหญ่ทั่วไป โดยให้ AI ทำเฉพาะศีรษะ ทรงผม ใบหู และคอปกติ
- ย้ายการต่อคอลึกและพื้นที่ใต้ไหปลาร้ากลับมาให้ MediaPipe + Canvas ทำในเครื่องทั้งหมด
- หาก OpenAI ยังบล็อกผลลัพธ์ ระบบใช้ภาพศีรษะต้นฉบับที่เตรียมไว้ทำงานต่อทันที ไม่หยุดอยู่หน้า error
- ไม่มีการลองเรียก AI ซ้ำอัตโนมัติ จึงไม่เกิดค่าใช้จ่ายซ้ำจาก fallback
- เมื่อเปลี่ยนทรงผมภายหลังแล้วถูกบล็อก ระบบคงภาพและทรงเดิมโดยไม่ทำให้ Master หรือตำแหน่งเสียหาย
- ไม่แสดงข้อความเทคนิคภาษาอังกฤษจาก OpenAI ให้ผู้ใช้เห็น

# V195 — No-AI skin controls

- เพิ่มเมนู “ปรับผิว” สำหรับผิวเนียน 0–30%, ความคมชัดผิว 0–25% และปรับแสงผิว −20% ถึง +20%
- ค่าแสงเริ่มต้น +10% เป็นค่าของแถบเลื่อนโดยตรง จึงไม่ถูกปรับซ้ำกับค่าคงที่เดิม
- ใช้ MediaPipe mask เดิมกับ Canvas เท่านั้น ไม่เรียก AI/API เพิ่มและไม่มีค่าใช้จ่ายต่อการปรับ
- ปรับเฉพาะผิวใบหน้าและคอ โดยป้องกันรายละเอียดรอบดวงตา คิ้ว จมูก และริมฝีปาก ไม่กระทบผม ชุด พื้นหลัง หรือเครื่องหมาย
- ทุกการเลื่อนเริ่มคำนวณใหม่จาก Master ต้นฉบับ จึงไม่สะสมความเบลอ และพรีวิว/ดาวน์โหลดใช้ตัวเรนเดอร์เดียวกัน
- เพิ่มปุ่มรีเซ็ตผิวกลับเป็น ผิวเนียน 0%, ความคมชัด 0% และแสงผิว +10%

# V194 — Seamless deep neck and clavicle opening

- ลบชั้นเสื้อเดิม/ไหล่สีดำและพื้นหลังสี่เหลี่ยมใต้ศีรษะด้วย semantic mask แบบบังคับ
- ใต้แนวคางอนุญาตเฉพาะพิกเซลผิวและเส้นผมที่ MediaPipe ยืนยัน จึงไม่ตีเสื้อสีดำเป็นผมอีก
- สร้างคอยาวต่อเนื่องและเปิดชั้นผิวลงถึงใต้แนวไหปลาร้า เพื่อรองรับคอเสื้อลึกทุก Template
- ขอบคอ–ไหปลาร้าเป็นทรงกายวิภาคโค้งและโปร่งใสจริง ไม่มีกรอบสี่เหลี่ยมหรือเส้นตัดตรง
- ปรับสมดุลสีตามแนวตั้งแบบจำกัดช่วง โดยคงแสงซ้าย–ขวา รูขุมขน และรายละเอียดผิว
- Prompt ของการประมวลผลครั้งแรกและการเปลี่ยนทรงผมใช้กฎคอ–ไหปลาร้าเดียวกัน โดยไม่เพิ่มจำนวนครั้งเรียก AI

# V193 — First-fit head placement + long-press drag

- หลังประมวลผลครั้งแรก ระบบคำนวณขนาดหัวจากสัดส่วนใบหน้าและช่วงไหล่ของชุดที่เลือก แล้ววางให้พอดีอัตโนมัติ
- การขยายหัวคงจุดคางไว้กับช่องคอเดิม จึงไม่ทำให้หัวลอยหรือคอยาว
- การลากย้ายหัวด้วยหนึ่งนิ้วต้องแตะค้างบนศีรษะ 320 ms ก่อน ลดการขยับโดยไม่ตั้งใจ
- การซูม พินช์สองนิ้ว ล้อเมาส์ และการเลื่อนมุมมองคงพฤติกรรมเดิมทั้งหมด
- ปุ่มรีเซ็ตหลักกลับสู่ตำแหน่ง First-fit ของชุด ไม่ย้อนกลับไปเป็นหัวขนาดเล็กก่อนจัดพอดี

# V192 — Clear neck hair + restrained skin retouch

- ทุกทรงผมถูกบังคับไม่ให้ทับผิวคอ ทั้งใน prompt และ mask เชิงกายวิภาคก่อนประกอบภาพ
- ปลายผมยาวคงอยู่ด้านข้าง/ด้านหลังคอและไล่ปลายเป็นธรรมชาติ ไม่ตัดเป็นเส้นตรง
- AI ลดเฉพาะสิวและจุดด่างดำแบบเบา ๆ โดยคงรูขุมขน รายละเอียดผิว รูปหน้า และอัตลักษณ์เดิม
- เพิ่มความสว่างเฉพาะพิกเซลผิว 10% แบบกำหนดแน่นอน โดยไม่ทำให้ชุด ผม หรือพื้นหลังสว่างตาม

# V42 — V38 + Remove AI Background Before Final Placement

- Base is the user-provided V38 ZIP.
- Everything else remains V38.
- New order: V38 compose -> AI skin/hair/neck -> remove.bg on AI result -> transparent generated person including neck -> V38 final identity/composite placement.
- No additional head scaling, lifting, uniform geometry, skin method, hair method, or template changes.

# V37 — Final Head Proportion Fit

- ฐาน V36 เดิมทั้งหมด
- ขั้นวางส่วนหัวสุดท้ายลดขนาดลงประมาณ 9.1% จาก V36 โดยย่อ X/Y เท่ากัน จึงไม่บีบ/ยืดใบหน้า
- ตำแหน่งคางยัง anchor กับช่องคอจริงของชุด และคำนวณใหม่ตาม scale ที่ลดลง
- ไม่แก้ ไม่สร้าง และไม่ resize ชุดจริง; uniform.png ยังเป็น final layer
- วิธีผิว V9, AI head-only, ลบพื้นหลัง, ตรา/อินทรธนู/เนกไท/พื้นหลัง และ pipeline อื่นคง V36

# V36 — AI Head Only / No AI Uniform Behind

- V28 composition is drawn first as immutable full-frame master.
- AI output is clipped to head/hair and a narrow neck socket only.
- AI cannot contribute shoulders, epaulettes, jacket, tie, lower body, or outer background.
- Original uniform.png is still composited as the final layer.
- V35/V9 skin behavior and V34 aspect-ratio correction are retained.

V24 — APPROVED RIGHT-SIDE SKIN MATCH

- เป้าหมายผิว: ฝั่งขวาของภาพเปรียบเทียบที่ผู้ใช้ยืนยัน
- ลด yellow/orange จาก V23 อีก โดยไม่ฟอกขาวและไม่ทำให้ชมพู/เทา
- คุม highlight หน้าผาก จมูก แก้ม ให้เป็นแสงสตูดิโอนุ่ม
- คง pores / fine lines / marks / texture และรายละเอียดกล้องจริง
- ปรับเฉพาะ skin color/light response; geometry, head-neck placement, hair, uniform, insignia, background, framing คงเดิม

V23 — LESS YELLOW SKIN ONLY

Changes from V22:
- reduces remaining yellow/orange warmth more strongly
- neutral-to-slightly-cool professional studio white balance
- preserves original pores, marks, texture and identity
- does not whiten, beautify, blur, reshape, or alter face geometry
- head/neck placement, proportions, hairstyle logic, uniform/template, insignia, background and framing remain unchanged

V22 — REFERENCE SKIN MATCH ONLY

Base: V21. No geometry/layout/template/hair changes.

V22 changes only skin/light rendering to match the approved reference image 2 more strongly:
- slightly lower, denser facial exposure instead of the brighter V21 look
- neutral/cool camera white balance; reduced yellow/orange cast
- controlled forehead/nose/cheek shine and softer highlight roll-off
- keeps real pores, marks, fine texture and facial identity
- no whitening, beauty filter, plastic/waxy skin, blur or heavy denoise
- generated neck is instructed to match the same skin exposure/tone
- head scale/position, neck geometry, hairstyle logic, uniform, insignia, background and framing remain V21

V21 — SKIN/LIGHT ONLY UPDATE

Changes from V20: skin tone/light/detail only, matched toward the approved earlier-test look. All geometry, head/neck placement, hair logic, uniform/template, background and framing remain unchanged.

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

## V19 Studio Skin refinement
- คง geometry / head placement / neck / hair pipeline ของ V19 เดิม
- เกลี่ยผิวเพียงเล็กน้อย ไม่ลบ pores / fine lines / moles / texture
- neutral studio white balance ลด yellow/orange cast
- ไม่ฟอกขาว ไม่ทำชมพู/เทา ไม่เพิ่ม makeup
- คอใหม่ต้อง match สีผิวและ exposure ของหน้า
- soft studio key + natural fill + realistic shadow/highlight roll-off
- ห้าม plastic/waxy/airbrush/heavy denoise/HDR look


## V19 — Face-adaptive selected hairstyle
- คง pipeline V19 เดิมทั้งหมด: ขนาด/ตำแหน่งหัวและคอ, ชุด, ฉาก, skin/lighting และ economy quality ไม่เปลี่ยน
- เปลี่ยนเฉพาะขั้น AI ทรงผม: ภาพทรงผมเป็น reference ของ 'แบบทรง' ไม่ใช่ overlay ตายตัว
- AI ต้องวิเคราะห์กรอบหน้า/หน้าผาก/ขมับ/กราม/แนวผม/ศีรษะจากภาพบุคคล แล้วปรับความกว้าง ความโค้ง volume และแนวเส้นผมของทรงที่เลือกให้เข้ากับคนนั้น
- ห้ามดัดกรอบหน้าเพื่อให้เข้ากับทรงผม และห้ามคัดลอกหน้า/หัว/สัดส่วนจากนางแบบทรงผม
- ทรงที่เลือกยังต้องดูเป็นทรงเดิม แต่ fit กับโครงศีรษะจริงและดูเหมือนถ่ายจริง


## V20 — Natural skin refinement
- ต่อจาก V19 Face-adaptive hairstyle โดยไม่เปลี่ยน geometry, head/neck placement, uniform, background หรือ hairstyle fitting
- เกลี่ยผิวเพิ่มขึ้นเพียงเล็กน้อยจาก V19 เฉพาะ tonal blotchiness / micro-contrast ที่แข็งเกินไป
- ยังคง pores, fine lines, moles, texture และรายละเอียดจริงของใบหน้า
- ลด micro-contrast boost ของ restored original face เพื่อให้ผิวดูนุ่มเป็นภาพถ่ายมากขึ้นโดยไม่เบลอ
- ห้าม airbrush / waxy / plastic / heavy denoise / beauty filter / whitening


## V38
- Keep V37/V28 pipeline unchanged except final placement fixes.
- Final head layer is scaled to 80% of V37 (uniform X/Y; no distortion).
- Full-frame AI pixels are no longer the base. V28 locked composition is the base, and AI is clipped to a narrow central head/hair/neck window. This removes AI-generated duplicate uniform/epaulettes behind the real uniform.
- Original uniform.png remains the final overlay layer.
