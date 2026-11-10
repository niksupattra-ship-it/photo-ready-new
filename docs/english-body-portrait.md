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
accepts three normally proportioned sample portraits without extra generation.
Actual provider correction quality and deployment still require verification.


## English editing flow

After uploading, users explicitly choose **AI outfit** or **Edit manually**.
AI outfit opens the outfit, Natural/Makeup and hairstyle choices. Selecting a
choice never submits a portrait job: **Create portrait** is the single submission
action. The selected outfit determines the portrait mode. Existing access and
credit checks still run before generation.

Edit manually opens Studio with the uploaded source (or the existing result),
without requesting AI generation. The original remains available when switching
back to AI. After generation, Review & edit offers manual editing and the existing
download flow. Selecting another outfit on an AI result opens configuration for
confirmation; in manual mode, it only places the local outfit layer.

The flow applies only to `?lang=en`. Thai Easy Mode is unchanged. Browser
regression: `python tests/english-portrait-flow.browser.py` with Vite on port 5193.
The fixture mocks generation and checks submission timing, selection delivery,
manual entry, outfit changes, mobile layout and Thai isolation; it does not
validate external AI rendering.

Studio keeps one pending outfit/hairstyle/look selection when switching between
AI setup and manual editing. Setup has a direct **Edit manually** action that
places the selected outfit without starting AI. Returning to AI restores the
choices. **Create portrait** submits them together; an unchanged selection with
a matching existing portrait returns to that result without resubmitting.
Replacing the uploaded photo clears the pending choices.
