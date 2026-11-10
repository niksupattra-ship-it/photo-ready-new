# English AI clothed portraits

Only `?lang=en` submits `interfaceLanguage=en` and
`portraitComposition=en-outfit-body-v1`. Thai processing remains unchanged.
English choices include job outfits only. Government and student categories
are hidden, and their paths are rejected for new English generation requests.
New English portraits start with a white background; Thai defaults and saved
projects' existing background choices are retained.

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

English proportion checks now measure the returned transparent person using
face landmarks and shoulder silhouette. Oversized results are corrected by AI
once on the SAME undelivered job. The real correction input is the current
person, not the original selfie crop. Both finishes are replaced atomically,
with no new credit reservation. The corrected result is measured again before
delivery; known unbalanced results fail rather than silently bypass the check.
Cropped/unmeasurable shoulder evidence is not guessed, and hair height alone
does not shrink a naturally proportionate face.

Ownership, English mode, undelivered status and a one-attempt database claim
protect `/api/ai-jobs/:id/proportions`. Confirmation waits for the correction;
cancellation retains the normal single-refund behavior and late AI completion
cannot resurrect cancelled work. Failed corrections retain the normal failure
and cancellation flow. This adds processing time only to oversized results.

Additional checks:

- `node --test tests/english-proportions.test.js`
- `TEST_DATABASE_URL=<development database> node scripts/check-english-proportion-delivery.mjs`
- `SELECTION_BASE=http://127.0.0.1:5193 MATTE_BASE=http://127.0.0.1:3000 python3 tests/english-proportions.browser.py`

The PostgreSQL/Express test uses a temporary isolated schema, removed on exit;
it covers credit balance, pair replacement, concurrency, ownership, cancellation
and failure without paid services. The real MediaPipe + MODNet browser test
checks three demonstration portraits against the current proportion targets.
Actual provider correction quality and deployment still require verification.

The current English preference makes the generated whole head 10% smaller
relative to the same torso: target face/shoulder and head-height ratios are
0.90 times the earlier targets. Correction scales include this preference once;
the face is never stretched or locally resized by the browser. New cache keys
avoid using results generated with the previous head size.

Final placement fits the visible alpha bounds instead of the PNG dimensions.
A uniform cover scale fills the background width and lower edge, with 3.5%
headroom above the hair crown. Any crop needed for the portrait is on the torso,
not the head. The same placement is used for the editor and image export.
