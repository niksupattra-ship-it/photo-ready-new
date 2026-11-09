# English AI clothed portraits

Only `?lang=en` submits `interfaceLanguage=en` and
`portraitComposition=en-outfit-body-v1`. Thai processing remains unchanged.
English choices include job outfits, one female civil-service trial
(`female-operational.png`) and one Rajabhat female student trial
(`female-rajabhat.png`).

AI creates the head, neck and clothed upper torso together as one continuous
portrait. The selected real outfit is supplied at up to 2048 pixels (without
upscaling) to retain small fabric and insignia details. The prompt prioritises
reference silhouette, collar/lapels, seams, pockets, fabric weave/pattern,
buttons and every insignia's count, placement, orientation and internal motif.
The reference outfit remains the authority for lighting, colour and sharpness;
face/ear/neck lighting adapts to it. The result is still AI reconstruction, so
pixel-identical clothing is not guaranteed.

Background removal retains the complete person. The browser does not cut away
AI clothing, replace it with a PNG, reshape the neck, or fit the head separately.
The temporary original-template compositor and neck feather were removed.
Both makeup options retain the same silhouette and garment appearance; English
makeup omits the independent fill-flash exposure instruction. Existing outfit
choices and hairstyle changes regenerate from the original person and selected
outfit. A new English cache version avoids reuse of locally composited results.
Saved metadata keeps the complete person as one transparent layer and the suit
selection as hidden metadata.

Validation:

- `node --test tests/english-body-portrait.test.js tests/ai-makeup-pair.test.js tests/portrait-collar-reference.test.js`
- `node scripts/check-shared-natural-portrait.mjs`
- `node scripts/check-portrait-uniform-fit.mjs`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/english-body-response.browser.py`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/head-only-suit-fit.browser.py`
- `./node_modules/.bin/vite build`

Provider tests use inert responses and actual reference files. Browser checks
verify torso preservation, aspect ratio, transparency and outfit selection.
Real AI output quality and production deployment remain unverified here.
