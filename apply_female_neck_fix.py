from pathlib import Path
import sys
p=Path(sys.argv[1]) if len(sys.argv)>1 else Path('production-portrait-pipeline.js')
s=p.read_text(encoding='utf-8')
old='Keep the person\'s chin position and natural neck length/width.'
new=('Keep the person\'s chin position, original head size and all facial geometry exactly unchanged. '
     'FEMALE NECK POSTURE CORRECTION ONLY: For a female portrait, straighten the neck axis to an upright frontal passport-photo pose, even when the source neck is short, tilted or narrow. '
     'Extend or reconstruct ONLY the neck skin region below the unchanged original chin-to-neck junction to a modest anatomically natural visible length, with proportional width and bilateral alignment beneath the original jaw. '
     'Keep the original jaw, chin, ears, face landmarks, hair, head scale, expression and image framing fixed; never stretch, translate, rotate or regenerate the head or face. '
     'Create continuous natural neck skin texture and matching lighting with no seam, notch, side gap or artificial elongated cylinder. '
     'Do not change shoulders, clothing, cosmetics, hairstyle or any other processing behavior. '
     'For male portraits, preserve the original neck length/width and posture.')
assert s.count(old)==1, 'Expected neck instruction not found exactly once; no file changed'
s=s.replace(old,new,1)
# Restrict neck normalization to women by explicitly supplying the gender in the existing prompt.
anchor='NECKLINE-CONTOUR CUTOUT: '
assert s.count(anchor)==1, 'Unexpected prompt structure; no file changed'
s=s.replace(anchor,'NECKLINE-CONTOUR CUTOUT: ',1)
p.write_text(s,encoding='utf-8')
print('Updated:',p)
