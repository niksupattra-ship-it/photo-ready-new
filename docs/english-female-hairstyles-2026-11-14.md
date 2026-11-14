# English women's hairstyle replacement — 14 November 2026

Based on main `5456a6e91ddd69e7f8814ddd0e5604fe776dbf6f`.

English Studio now lists the ten uploaded styles in their numbered order.
`ตัวอย่าง.rar` supplies the picker photographs; `แบบผมหญิง.zip` supplies the
matching full-resolution transparent source PNGs. Original PNG bytes are
retained in references 44–53. New IDs avoid changing the meaning of older
saved projects or cached results.

| Upload number | ID | Style |
| --- | --- | --- |
| 1 | seedream-44 | Sleek centre-parted long hair |
| 2 | seedream-45 | Centre-parted long waves |
| 3 | seedream-46 | Shoulder-length soft layers |
| 4 | seedream-47 | Centre-parted blunt lob |
| 5 | seedream-48 | Side-parted swept waves |
| 6 | seedream-49 | Sleek low ponytail |
| 7 | seedream-50 | Soft half-up long hair |
| 8 | seedream-51 | Rounded chin-length bob |
| 9 | seedream-52 | Long layers with wispy fringe |
| 10 | seedream-53 | Low updo with face-framing wisps |

Picker WebPs are 400 pixels wide. AI receives a hair-only guide derived from
the uploaded source, retaining source RGB wherever hair remains. Local pinned
segmentation removes the donor's face, neck and clothing; no paid generation
is used to prepare these assets. Eye anchors come from the matching example
for the existing personal hair-placement guide. The manifest binds each
picker, original PNG and hair-only guide with SHA-256.

The new IDs require an English body-portrait request with the existing studio
finish and catalogue-reference protocol. Thai choices, men's choices, AI Picks,
garments, sizing, skin/cosmetics and generation counts retain their current
behavior. Women still receive the existing Natural/Makeup pair.

Validation: production build and all 45 picker/guide bindings pass. Four new
catalogue/pipeline tests cover every style, donor-feature removal, language
isolation and paired alpha. The selected head/current-hair regressions pass
alongside them (14 tests). Four Chromium scenarios at 390/1440 pixels cover
English/Thai choices, all ten English selections, decoded picker images and
cancel without generating or changing the current portrait.

The full Node suite reports 109 passed and eight failed; the clean baseline
reports 105 passed and the identical eight failures. The older broad English
PNG-flow browser script reaches an unrelated native-aspect assertion failure.
These are reported separately, not treated as passing coverage or repaired by
changing the current product behavior. No live AI calls or payments were used.
