from pathlib import Path
import sys
p = Path(sys.argv[1]) if len(sys.argv)>1 else Path('production-portrait-pipeline.js')
s = p.read_text(encoding='utf-8')
old = "NECKLINE-CONTOUR CUTOUT: Keep the person's chin position and natural neck length/width."
assert s.count(old) == 1, 'Expected original instruction exactly once; unchanged.'
assert "export function productionPortraitPrompt(selected){" in s, 'Unexpected prompt structure; unchanged.'
assert 'const cosmetics=selected.gender' in s, 'Gender selection not found; unchanged.'
# Only female gets changed instructions. Male branch reproduces the original literal exactly.
replacement = "${selected.gender==='female' ? `NECKLINE-CONTOUR CUTOUT: Keep the original chin position, jawline, ears, head dimensions and all facial landmarks exactly unchanged. FEMALE NECK ALIGNMENT ONLY: Correct the neck BELOW the original chin-to-neck junction into a naturally upright frontal ID-photo posture. If the source neck is short, narrow or tilted, reconstruct only the visible neck skin below that fixed junction to a modest anatomically plausible length and balanced width, with its central axis upright beneath the unchanged head. Keep neck base broad and curved for uniform placement, with consistent original skin tone, pores, light and shading. Do not rotate, move, scale, stretch or regenerate the head, jaw, chin, ears or face. Do not enlarge the head or alter the hairstyle, makeup, shoulders, clothing or framing. This correction is limited to neck skin and its lower cutout boundary; all other instructions remain in force.` : `NECKLINE-CONTOUR CUTOUT: Keep the person's chin position and natural neck length/width.`}"
s2=s.replace(old,replacement,1)
assert s2.count('NECKLINE-CONTOUR CUTOUT:')==2, 'Unexpected duplicate neck instructions; unchanged.'
assert s2.count('NECK AND EARRING EXCEPTIONS ARE LOCAL:')==1, 'Face safety priority missing; unchanged.'
assert s2.count('HAIR BEHIND SHOULDERS')==1, 'Hair policy missing; unchanged.'
p.write_text(s2,encoding='utf-8')
print('Patched female-only neck prompt:',p)
