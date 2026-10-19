from pathlib import Path
p=Path(__file__).resolve().parent/'production-portrait-pipeline.js'
if not p.exists():
    raise SystemExit('Place this script alongside production-portrait-pipeline.js')
s=p.read_text(encoding='utf-8')
if 'FEMALE NECK GEOMETRY — BELOW CHIN ONLY' in s:
    raise SystemExit('Already patched')
needle='  return prompt+"\\nLOWER FACE AND EAR ANATOMY PRIORITY'
assert s.count(needle)==1, 'Unexpected source version; no changes made'
insert='''  // Female-only neck geometry. Leave the shared male prompt unchanged.
  const femaleNeck = selected.gender==='female' ? `\\nFEMALE NECK GEOMETRY — BELOW CHIN ONLY (OVERRIDES NECK LENGTH/WIDTH RETENTION, NOT FACE PROTECTION): Keep the entire head and original face at the exact original position, scale, angle and shape, including ears, jawline, chin and the chin-to-neck junction. Keep all existing face skin pixels, skin finish, makeup and hair instructions unchanged. Only below that junction, construct a natural front-facing, vertically aligned neck that joins the unchanged chin seamlessly and is centered beneath the head. If the source neck is short, tilted or narrow, give the lower neck a modest anatomical extension and proportionate width, using the head width and natural sternocleidomastoid contours as guides. Never make a long cylindrical neck, narrow stalk, floating head, stretched throat, broad block neck, or unnatural straight sides. Preserve original complexion, pores, lighting, soft natural shadows and skin texture throughout the neck; no smoothing or recoloring. Keep the broad, low, smooth U-shaped neck/clavicle cutout as specified, with enough natural neck base to place under a uniform. This female-only exception supersedes ONLY the earlier instruction to retain the source neck length/width and the no-neck-stretch restriction. It does NOT supersede the exact original chin position, chin-to-neck junction, facial anatomy, hairstyle, image framing, cosmetics, hair-behind-shoulders, garment removal or matting requirements. Do not rotate, resize or reposition the head to straighten the neck.` : '';
'''
s=s.replace(needle,insert+needle,1)
old='  return prompt+"\\nLOWER FACE AND EAR ANATOMY PRIORITY'
new='  return prompt+femaleNeck+"\\nLOWER FACE AND EAR ANATOMY PRIORITY'
assert s.count(old)==1
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('Patched:',p)
