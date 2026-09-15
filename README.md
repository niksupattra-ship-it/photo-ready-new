# GovPhoto v4 Pixel-Locked Photoshop Engine

## เปลี่ยนจาก v3
- ชุดราชการไม่ถูกส่งเข้า Generative AI
- เข็ม / อินทรธนู / กระดุม / ปก / เนกไท / texture เป็น source pixels ของ Template จริง
- Composite และ export ด้วย Sharp
- Canvas 900×1200, 3:4
- AI calls ใน baseline = 0

## สิ่งที่ v4 baseline ทำได้
Pixel-locked resize + layer compositing + optional mask

## สิ่งที่ต้องเพิ่มก่อน production เพื่อให้คอเนียนอัตโนมัติทุกคน
ต้องมี deterministic segmentation + face/jaw/neck/shoulder landmarks + adaptive neck mask +
local color/exposure matching + protected-region mesh warp + quality checks.
ห้ามอ้างว่า baseline นี้ทำสิ่งเหล่านั้นแล้ว เพราะยังไม่ได้ใส่ detector/landmark engine จริง

แนวทาง production:
1. ตรวจ face/jaw/neck/shoulder landmarks
2. สร้าง person/hair mask
3. คำนวณ head-to-shoulder ratio
4. Scale/position template โดยไม่แตะ protected insignia regions
5. Feather neck edge และ local exposure/white-balance match
6. QC: giant head, floating neck, cropped shoulders, seam/halo
7. Export 900×1200
