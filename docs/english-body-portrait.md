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

English head/body balance is requested during the original generation. The
current browser does not submit a second automatic proportion-correction job or
reject a completed Natural/Makeup pair based on shoulder-silhouette ratios.
Clear-face, valid-image and completion checks still run before Studio delivery.
The legacy `/api/ai-jobs/:id/proportions` endpoint remains available for older
open clients; its ownership, credit and cancellation protections are unchanged.

`node --test tests/english-completed-delivery.test.js` verifies that completed
pairs are retained without additional AI requests or ratio-based rejection, and
that worker logs distinguish a completed result from failed HTTP responses and
worker exit. Browser console errors include the job ID and client failure stage
without changing the short public failure message. These are local regressions;
they do not determine the exact failure reason for a production job from a
worker-exit log alone.


## English editing flow

After uploading, users explicitly choose **AI outfit** or **Edit manually**.
AI outfit opens the outfit, Natural/Makeup and hairstyle choices. Selecting a
choice never submits a portrait job: **Create portrait** is the single submission
action. The selected outfit determines the portrait mode. Existing access and
credit checks still run before generation.

Edit manually opens Studio with the uploaded source (or the existing result),
without requesting AI generation. The original remains available when switching
back to AI. After generation, Review & edit offers manual editing and the existing
download flow. Clicking an outfit card places the local outfit layer for manual editing,
including when the existing portrait came from AI. A separate **Edit with AI**
action appears on hover or keyboard focus (always visible on touch devices);
it opens the hairstyle panel directly inside Studio for that selected outfit.
No setup dialog is opened. The panel offers **Create portrait** and **Cancel**,
and starts with **Keep current hairstyle** selected. When the user keeps their
current hair, the server loads their owned completed portrait as the hair-only
reference, while the immutable upload continues to control facial identity.
A newly selected catalogue hairstyle replaces that reference. Nothing is
submitted until **Create portrait** is pressed.
The extra workflow toolbar above the Studio header is removed.

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

Manual outfit placement measures the new PNG's native alpha bounds and collar,
then positions its collar below the existing portrait's chin using one uniform
scale. It never reuses a full-person AI placement as a garment frame. New
outfit placement clears inherited squeeze/rotation/scale values and leaves the
portrait untouched. Missing face evidence uses a proportional chest placement.

When placing a manual PNG outfit over an English AI portrait, a reusable layer
mask hides the previous AI clothing using the existing local segmentation and
neck-alpha cleanup. Full portrait pixels and both generated finishes remain
unchanged. Finish switching retains this mask; removing the manual outfit or
returning to the same complete AI portrait restores the previous mask. These
mask sources participate in saved-project image validation and resource limits.
No extra portrait-generation request is made for manual clothing removal.
