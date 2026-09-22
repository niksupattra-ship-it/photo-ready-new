# V209 — AI-blended hairstyle with immutable face

- ยกเลิกการนำ PNG ทรงผมไปวางทับศีรษะในขั้นประมวลผลหลัก ซึ่งทำให้ไรผมดูเป็นวิกและเห็นขอบผิวเป็นกรอบ
- ให้ AI สร้างทรงที่เลือกและเกลี่ยไรผม รากผม ปริมาตร และปลายผมให้สมจริงกับกะโหลกและโครงหน้าในงานเดียวกับศีรษะ–คอ
- ส่ง Face Lock Mask แบบทึบเพื่อห้ามแก้หน้าผากผิว คิ้ว ตา แววตา จมูก ปาก แก้ม กราม คาง และรายละเอียดผิวเดิม
- เมื่อเปลี่ยนทรงภายหลัง AI แก้เฉพาะพื้นที่ผม และระบบนำกลับมาเฉพาะพิกเซลผมที่ผ่าน Mask; ใบหน้า คอ ชุด และตำแหน่งใช้จาก Master เดิม
- ทุกทรงเริ่มจาก Master เดียว ไม่ใช้ผลทรงก่อนหน้าต่อกัน จึงไม่สะสมการเปลี่ยนใบหน้า; ผลที่ผ่านแล้วถูกแคชเพื่อไม่เสียเครดิตซ้ำเมื่อเลือกทรงเดิม

# V208 — Keep approved face and render the selected hairstyle

- แก้สาเหตุหลักที่เลือกทรงผมแล้วได้หัวโล้น: ตัวจัดตำแหน่งอ่าน `naturalWidth` จาก Canvas ทำให้ค่าขนาดเป็น undefined และ Transform เป็น NaN; รุ่นนี้รองรับทั้ง Image และ Canvas อย่างถูกต้อง
- คงใบหน้า โครงหน้า แววตา ผิว และรายละเอียดรูขุมขนจากผลที่ผ่านแล้ว แล้ววางเฉพาะ PNG ทรงผมที่ผู้ใช้เลือก
- เพิ่มด่านตรวจจำนวนพิกเซลผมหลังจัดตำแหน่งและตัด Mask; หากผมหายหรืออยู่นอกภาพ จะไม่ยอมรับภาพหัวโล้นเป็นผลลัพธ์
- การวางและเปลี่ยนทรงผมยังทำในเครื่อง ไม่เรียก AI ซ้ำและไม่เสียเครดิตเพิ่ม

# V207 — Seamless single-layer face and visible selected hair

- ยกเลิกการนำใบหน้าต้นฉบับมาวางทับผล AI ซึ่งทำให้เกิดแถบสี่เหลี่ยมบนหน้าผาก; ภาพศีรษะ–ใบหน้า–คอเป็นชั้นภาพเดียวต่อเนื่องกัน
- แก้สาเหตุหัวโล้น: body-skin mask จะป้องกันเฉพาะตั้งแต่ใต้กรามลงไป ไม่ลบ PNG ทรงผมบนหนังศีรษะอีก
- เพิ่มความชัดของรูขุมขนแบบ local unsharp mask เฉพาะ skin mask ในภาพชิ้นเดียว ไม่เพิ่มใบหน้าอีกชั้น ไม่ฟอกผิว ไม่เบลอ และไม่แตะผม/ชุด/พื้นหลัง
- ย้ำ prompt ให้คงโครงหน้า แววตา ความไม่สมมาตรตามธรรมชาติ ไฝ รอย และรูขุมขนจากภาพต้นฉบับ ห้ามสร้างคนหน้าคล้ายคนใหม่

# V206 — Original-face pixel lock and upper-collar-only layer

- นำพิกเซลใบหน้าจากภาพอัปโหลดกลับมาวางทับหลัง AI โดยจัดตำแหน่งจากดวงตา จึงคงโครงหน้า แววตา คิ้ว จมูก ปาก กราม และสีหน้าจากต้นฉบับ
- ไม่พึ่ง edit mask ของบริการเพียงอย่างเดียว เพราะไม่รับประกันว่าพิกเซลใบหน้าจะคงเดิม
- กรองชั้น AI ใต้กรามด้วย skin mask เพื่อตัดเสื้อ ปก และลำตัวล่างที่ AI สร้างติดมา ก่อนวางใต้แพทเทิร์นชุด
- กำหนดฐานคอให้เปิดออกถึงไหปลาร้าทั้งสองข้าง กว้างถึงกึ่งกลางระหว่างคอกับข้อต่อไหล่ ลงลึกเลยไหปลาร้าเล็กน้อย แล้วหยุดโดยไม่สร้างลำตัวล่าง

# V205 — Deterministic local hairstyles, no repeat AI charge

- AI ทำเฉพาะฐานศีรษะ–คอแบบสะอาดหนึ่งครั้งในการประมวลผลแรก ไม่เรียก AI ซ้ำเมื่อเปลี่ยนทรงผม
- วาง PNG ทรงผมตรงรหัสที่เลือกด้วย Face Landmark และจุดยึดจากภาพพรีวิว ทำให้ผลเดิมซ้ำได้และไม่สุ่ม
- ล็อกใบหน้าส่วนกลาง ผิวคอ และไหล่ก่อนวางผม จึงไม่ให้ผมทับผิวคอหรือเปลี่ยนใบหน้า
- แคชผลทรงผมในเครื่อง เลือกซ้ำได้ทันทีโดยไม่เสียเครดิต

# V204 — Exact hairstyle reference with face lock

- แก้สาเหตุทรงผมผลลัพธ์ไม่ตรงแบบ: ส่งไฟล์ทรงผมโปร่งใสตรงรหัสที่เลือกแทนภาพตัวอย่างที่มีใบหน้าบุคคลอื่น
- ส่ง mask พร้อมงานเปลี่ยนทรงผม ล็อกใบหน้า คิ้ว ตา จมูก ปาก กราม หู คอ ผิว ชุด และพื้นที่นอกเขตผม
- เปิดเฉพาะหน้าผากส่วนบนสำหรับผมม้า และเขตด้านข้างสำหรับผมยาว โดยไม่เปิดให้ AI แก้คอหรือชุด
- หลัง AI ส่งผลกลับ ระบบจะแยกผมซ้ำและนำมาวางบนภาพต้นฉบับเท่านั้น จึงไม่รับใบหน้า ผิว คอ หรือชุดจากภาพ AI
- เก็บแคชเฉพาะผลที่ผ่านการแยกผมและตรวจพื้นที่ล็อกแล้วเท่านั้น

# V203 — Full neck/shoulder coverage and silent UI failures

- แก้รอยแหว่งสีพื้นหลังด้านซ้าย–ขวาของคอที่เกิดจากการนำ mask ผิวความละเอียดต่ำมาตัดทับ alpha ของบุคคลอีกครั้ง
- ใช้ alpha ของชั้นบุคคลจาก MODNet เป็นขอบจริง และไม่ให้ semantic skin mask กินขอบคอ/หัวไหล่อีก
- mask ใหม่รักษาคอเต็มใต้กราม เปิดออกเร็วถึงกึ่งกลางระหว่างคอกับข้อต่อหัวไหล่ทั้งสองข้าง และต่อยาวลงถึงอกบนสำหรับคอเสื้อลึก
- เพิ่มพื้นที่ทึบช่วงล่างและ feather เฉพาะขอบนอก เพื่อไม่ให้ผิวหายเมื่อเลื่อนหรือขยายหัว
- Prompt แบบสุภาพกำหนดให้ AI ส่งพื้นที่ฐานคอครบทั้งสองข้างและเลยขอบปกเสื้อ โดยไม่กลับไปใช้ถ้อยคำที่เสี่ยง safety block
- เปลี่ยน cache key เพื่อไม่ใช้ภาพทรงผมจาก mask รุ่นเก่า
- ซ่อนข้อความผิดพลาดทางเทคนิคทั้งหมดจากหน้าเว็บ; เมื่อขั้นตอนใดไม่สำเร็จจะคงภาพเดิมและบันทึกเฉพาะ console โดยไม่ขึ้นกรอบ error

# V202 — Moderation-safe professional portrait request

- แก้สาเหตุภาพสมัครงานปกติถูก safety block: ยกเลิกการส่งคำสั่งที่กล่าวถึงผิวช่วงอก ไหล่เปลือย และการไม่มีเสื้อผ้า
- ใช้คำสั่งใหม่ว่าเป็นภาพติดบัตรสุภาพ โดยสร้างเฉพาะแนวคอถึงขอบปกเสื้อสำหรับวางใต้ Template ชุดเดิม
- ตั้งค่าการตรวจสอบภาพเป็น `moderation: low` ซึ่งเป็นระดับทางการที่รองรับสำหรับภาพ GPT โดยไม่ปิดระบบความปลอดภัย
- คง Face Lock, โครงหน้าเดิม, ผิวเดิม, ไม่มีการแต่งหน้า และการปรับแสงเฉพาะภาพมืดจาก V201
- เปลี่ยน cache key เพื่อไม่ดึงผลลัพธ์จาก prompt รุ่นเก่ากลับมาใช้
- หากยังถูกบล็อก ระบบยังคงภาพเดิม ไม่ลองซ้ำ ไม่หักเครดิตของระบบ และแสดงปุ่มเปลี่ยนภาพใหม่

# V201 — Face fidelity, adaptive skin light and safety-block recovery

- ล็อกโครงหน้าเดิมเป็นลำดับแรก: รูปหน้า หน้าผาก แก้ม กราม คาง ตา หนังตา คิ้ว จมูก ปาก หู สีหน้า อายุ และความไม่สมมาตรตามธรรมชาติ
- สร้าง face-lock mask จาก landmark ของภาพต้นฉบับและส่งร่วมกับงานแก้ภาพ เพื่อห้าม AI เขียนทับพิกเซลใบหน้า ไม่พึ่ง prompt อย่างเดียว
- ห้ามปรับรูปหน้า ทำหน้าเด็ก เพิ่มความสมมาตร แต่งหน้า ฟอกผิว ลบไฝ/กระ/รอยเดิม หรือรับลักษณะใบหน้าจากภาพอ้างอิงทรงผม
- เพิ่มเฉพาะความละเอียดของรูขุมขนจริงแบบไม่สร้างผิวใหม่ ไม่เบลอ และไม่ทำผิวพลาสติก
- ปรับความสว่างเฉพาะผิวเมื่อวัดได้ว่าภาพมืดเท่านั้น สูงสุด +12%; ภาพที่สว่างพอดีไม่ถูกยกแสง และไม่กระทบผม ชุด หรือพื้นหลัง
- เมื่อบริการภาพตอบ `moderation_blocked` หรือ `safety_violations` ระบบคงภาพเดิม ไม่ลองซ้ำ ส่ง `appCreditCharged: false` และแสดงปุ่ม “เปลี่ยนภาพใหม่” แทน error ดิบ
- ใช้กฎเดียวกันทั้งการประมวลผลครั้งแรกและการเปลี่ยนทรงผม

# V200 — Preserve AI neck, shoulders and upper chest

- แก้สาเหตุที่ V199 ตัดไหล่ ไหปลาร้า และช่วงอกออก: mask เดิมเริ่มแคบใต้กรามและเปิดลงล่างไม่พอ
- mask ใหม่รักษาแนวกรามก่อน หุบเข้าสู่คอช่วงกลาง แล้วเปิดกว้างเป็นไหปลาร้า หัวไหล่ และช่วงอกด้านบน
- Prompt บังคับให้ AI สร้างครบทั้งคอ ไหปลาร้าสองข้าง ผิวหัวไหล่เต็มแนว และผิวอกด้านบนสำหรับรองรับคอเสื้อลึก
- ห้ามมีช่องพื้นหลังระหว่างคอ ไหปลาร้า ไหล่ และอก และห้ามสร้างเสื้อหรือเครื่องหมายติดมากับชั้นบุคคล
- Template ชุดยังวางทับชั้นผิวตามเดิม จึงเห็นเฉพาะผิวที่อยู่ภายในช่องคอเสื้อ
- ใช้กฎเดียวกันทั้งประมวลผลครั้งแรกและเปลี่ยนทรงผม

# V199 — AI-balanced natural neck and clavicles

- ให้ AI สร้างคอและช่วงไหปลาร้าเป็นกายวิภาคเดียวกับศีรษะ โดยยึดความกว้างกราม ขนาดศีรษะ มุมกล้อง และแนวลำตัวของภาพต้นฉบับ
- รูปทรงคอเรียวยาวพอดีจากใต้กราม หุบเล็กน้อยช่วงกลาง และค่อย ๆ กว้างอย่างสมมาตรเข้าสู่ไหปลาร้าทั้งสองข้าง
- ไม่คัดลอกขนาดคอจากภาพอ้างอิง และป้องกันคอเล็กเกินไป ยาวเกินไป ทรงกระบอก หรือบานฉับพลัน
- ยกเลิกการวาดและยืดผิวคอด้วย Canvas; Canvas ทำเฉพาะ mask ขอบและประกอบกับ Template ชุด
- สี แสง เงา รูขุมขน และรายละเอียดผิวช่วงคอ–ไหปลาร้ามาจากผล AI ชิ้นเดียวกับศีรษะ จึงไม่มีผิวซ้ำหรือรอยปะจาก Canvas
- ใช้กฎคอเดียวกันทั้งประมวลผลครั้งแรกและการเปลี่ยนทรงผมภายหลัง

# V198 — Rollback to attached V194

- คืนระบบทั้งหมดกลับไปยังไฟล์ `photo-ready-V194-seamless-deep-neck-clavicle-full(1).zip` ที่ผู้ใช้แนบมา
- ยกเลิกการเปลี่ยนแปลงจาก V195, V196 และ V197 ทั้งหมด
- โค้ดการประกอบศีรษะ คอ ผิว ทรงผม และการจัดวางกลับไปใช้พฤติกรรมของ V194
- เปลี่ยนเฉพาะเลขเวอร์ชันและบันทึกการย้อนกลับครั้งนี้

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


## V210 — Studio fill flash and natural neck proportions
- Skin-only, highlight-protected shadow fill; original pore-scale detail is not blurred or synthesized.
- AI neck-fit guidance based on original jaw width and a slightly wider under-jaw compositing corridor.
- The face-lock mask, selected hairstyles, uniforms, and export pipeline are unchanged.

V218: Restored V160 skin/hairstyle prompt profile for initial generation and subsequent hairstyle edit; retained V217 templates, positioning, and UI. No API image call was made during packaging.


V219: Retain V218 skin/hair pipeline. Confirmed V217 and V218 main.jsx/style.css/assets are byte-identical. Government selector already uses gender-specific 3 uniforms and has no ministry selector. Added no-store HTML/fallback headers, /api/version, and visible V219 UI marker to diagnose stale deployments. Redeploy the full ZIP and confirm /api/version reports V219 and the home header shows V219.
