from pathlib import Path
import sys

p = Path(__file__).resolve().parent / "production-portrait-pipeline.js"
if not p.is_file():
    sys.exit("ERROR: Place this script beside production-portrait-pipeline.js")
s = p.read_text(encoding="utf-8")
if "FEMALE UPRIGHT NECK SIDEWALL" in s:
    sys.exit("Already patched; no changes made.")

old = "  const prompt=`เปลี่ยนทรงผม"
new = """  const femaleNeckRule=selected.gender==='female'?`FEMALE UPRIGHT NECK SIDEWALL — LOCAL GEOMETRY ONLY:
From the unchanged original jaw-to-neck junction on BOTH sides, form a naturally upright, almost vertical neck contour down toward the lower neck. Keep the upper sidewalls straighter for a longer visible distance before they gently transition outward into the lower clavicle base. Do not let the sidewalls immediately slope outward or trace the original shoulder slope. Set the left and right neck sidewalls symmetrically upright relative to the existing head's central axis, while retaining subtle natural anatomy and original asymmetry where visible.
This is a LOCAL SIDE-CONTOUR correction below the chin, not an instruction to lengthen the whole neck, move the head, enlarge/shrink the skull, narrow the neck into a tube, lift the shoulders or stretch any skin pixels. Keep natural adult neck width in proportion to the ORIGINAL jaw and head, with gradual smooth transitions and believable soft shading. Preserve the original chin position, jawline, face, skin colour, pores, makeup, hairstyle, framing, neck skin texture and natural neck lighting. Do not create visible shoulders, garments or extra body. Preserve the existing broad low U-shaped neck/clavicle cutout for uniform fitting. This local neck-sidewall instruction overrides ONLY the original neck length/width retention insofar as it prevents straightening the FEMALE side contour. All facial, skin, hair, background, matting and neckline rules remain unchanged.`:'';
  const prompt=`เปลี่ยนทรงผม"""
assert s.count(old)==1, "Unexpected prompt anchor"
s=s.replace(old,new,1)
old2="SKIN / COSMETICS: ${cosmetics}\nNECKLINE-CONTOUR CUTOUT:"
new2="SKIN / COSMETICS: ${cosmetics}\n${femaleNeckRule ? femaleNeckRule+'\\n' : ''}NECKLINE-CONTOUR CUTOUT:"
assert s.count(old2)==1, "Unexpected neckline anchor"
s=s.replace(old2,new2,1)
# Keep the existing male text identical, but scope the conflicting sentence to the male.
old3="NECKLINE-CONTOUR CUTOUT: Keep the person's chin position and natural neck length/width."
new3="NECKLINE-CONTOUR CUTOUT: ${selected.gender==='female' ? \"Keep the person's chin position and original jaw-to-neck junction; only the female neck sidewalls below it may be locally straightened as specified above.\" : \"Keep the person's chin position and natural neck length/width.\"}"
assert s.count(old3)==1, "Unexpected shared neck anchor"
s=s.replace(old3,new3,1)
assert "LOWER FACE AND EAR ANATOMY PRIORITY" in s
assert "NECK AND EARRING EXCEPTIONS ARE LOCAL" in s
p.write_text(s,encoding="utf-8")
print("Patched:",p)
print("Changes: female neck sidewalls only; male prompt retains original wording.")
