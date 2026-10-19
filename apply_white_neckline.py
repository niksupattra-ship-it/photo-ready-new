from pathlib import Path
import sys
p=Path(__file__).resolve().parent/'production-portrait-pipeline.js'
if not p.exists(): sys.exit('ERROR: place this script beside production-portrait-pipeline.js')
s=p.read_text(encoding='utf-8')
if 'FEMALE MODEST WHITE ROUND NECK' in s: sys.exit('Already patched')
anchor='  const prompt=`เปลี่ยนทรงผม'
assert s.count(anchor)==1, 'Unexpected source version: prompt anchor missing'
insert='''  const femaleModestNeck=selected.gender==='female'?`FEMALE MODEST WHITE ROUND NECK — STRICT COVERAGE: For the temporary construction garment, use an opaque plain WHITE wide ROUND-NECK shirt, with a smooth, continuous U-shaped collar edge at or just below the collarbones. The shirt MUST cover the entire upper chest and all cleavage: no exposed breasts, sternum hollow, chest valley, plunging neckline, deep scoop, bare torso or décolletage. The visible skin is limited to the original face, the upright neck and a SMALL natural collarbone transition above the shirt collar. Never create a low-cut top or bare shoulders. The shirt is a temporary guide only: for the final uniform-fitting PNG cutout, remove the shirt and all garment pixels, leaving the clean neck-skin base ending at the HIGHER, MODEST, SHALLOW rounded neckline boundary. Preserve the original face, jaw, chin, complexion, pores, hairstyle, makeup, head size and camera framing. Do not enlarge the exposed skin area to reach the original low scoop cutout. This FEMALE-only coverage rule overrides any earlier instruction requesting a BROAD LOW scoop, skin below clavicles, upper sternum or deep U neckline; preserve the existing uniform compositing and transparency workflow.`:'';
'''
s=s.replace(anchor,insert+anchor,1)
anchor2='SKIN / COSMETICS: ${cosmetics}\nNECKLINE-CONTOUR CUTOUT:'
assert s.count(anchor2)==1, 'Unexpected source version: neckline anchor missing'
s=s.replace(anchor2,"SKIN / COSMETICS: ${cosmetics}\n${femaleModestNeck ? femaleModestNeck+'\\n' : ''}NECKLINE-CONTOUR CUTOUT:",1)
# Scope the shared low scoop instruction: male text stays unchanged, female receives explicit exception.
old='NECKLINE-CONTOUR CUTOUT: Keep the person\'s chin position and natural neck length/width.'
new='NECKLINE-CONTOUR CUTOUT: ${selected.gender===\'female\' ? "Keep the original chin position and jaw-to-neck junction. Follow the FEMALE MODEST WHITE ROUND NECK coverage and HIGHER shallow rounded neckline boundary above; never reveal chest or cleavage." : "Keep the person\'s chin position and natural neck length/width."}'
assert s.count(old)==1, 'Unexpected source version: neckline text changed'
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('Patched female-only neckline; male unchanged:',p)
