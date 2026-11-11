# English portraits

## Current: English outfit-locked face size (v6)

New English-only requests use `en-fixed-face-scale-pair-v6` and `outfit-complete-frame-v14-fitted-face`. With a valid source face box, the untouched source face is scaled uniformly into the selected outfit's fixed native-sized composition guide before generation. The fitted width target is 0.70 × the reference head width, replacing the prior v5 target of 0.75. The face and selected outfit appear together in Image 1, so the model is not also given a competing close-up face that could override the size. Hair is an independent style reference, never a scale reference. The original garment stays fixed; AI completes the skull, a short continuous neck and collar in one native portrait with no automatic head/neck warp after delivery. The female Makeup variant edits the same Natural frame without resizing the face or clothing.

If the browser lacks a usable source-face box, English retains the earlier neutral guide plus identity-reference path instead of inventing face geometry. Queued v3–v5 requests remain accepted, and Thai request fields, prompts, processing, generation, downloads and cache are unchanged. New version tags prevent older oversized English outputs from being silently reused for explicit new Create actions. Code tests cover guide dimensions, garment pixel preservation, identity reference order, female/male request counts and Thai isolation. This is a target and protocol change, not a guarantee that every third-party AI result will match an exact ratio; real generated samples still need visual QA.

## Previous: complete native English portrait delivery

New English requests use `portraitComposition=en-outfit-body-v1`,
`englishStudioFinishVersion=en-complete-ai-pair-v4` and
`portraitFramingVersion=outfit-complete-frame-v12-ai-native`.
Thai generation, prompts, anatomy and its existing three-call female pipeline
remain unchanged. Earlier queued v3 requests still validate and older saved
projects remain readable.

One user action generates a complete Natural photograph containing the original
person's face, selected hairstyle, continuous neck and selected outfit. The
actual base image is the fixed selected garment layout; the original face crop,
exact picker hair, native garment detail and optional scalp attachment guide
remain separate references. The source person's torso does not set garment
width/height. The prompt asks AI to complete the whole anatomy and garment fit
in this same photograph; it no longer asks for a27–31% face/shoulder ratio.
The second request edits that completed Natural photograph with the accepted
Studio cosmetics. It uses the same frame, hairstyle, outfit and shared alpha.
Female pairs require exactly two provider requests; male Natural requires one.
No extra AI polish or automatic retry was added.

Completed English body portraits no longer call `balanceEnglishPortrait` during
creation. There is no automatic head reduction, neck warp, chin-anchor resize
or garment/body correction after AI. The generic source/output facial-ratio
delivery gate is also skipped for these complete male portraits; the existing
clear-face completion check remains. Optional input landmark/hair placement
measurements do not alter the delivered photograph.

Both native PNGs are retained. Studio's complete-body layer reads the original
PNG data URL directly, rather than repainting it through another native-sized
canvas. Placement fits the whole3:4 image uniformly into the3:4 scene, with no
separate head/neck/outfit transform. Background selection, watermarks and the
existing download/payment flow still work. The manually clicked **Balance head
size** tool remains available; creation never invokes it automatically.

V4/V12 cache and reuse checks prevent an earlier automatically warped result
from being reused for an explicit new Create. Switching Natural/Makeup reuses
the stored pair without another AI request. The selected hairstyle survives
outfit changes, and a changed outfit creates its own complete AI portrait.
AI garment details are reconstruction, not a promise of pixel-identical fabric.
Native output remains1824×2432, within the verified Flash pixel cap; English
export remains2304×3072 and Thai export remains unchanged.

Focused regressions run the actual App completion and layer-building functions:
Natural and Makeup PNG bytes must survive unchanged, and head/neck correction,
canvas repainting, local cosmetics and additional AI calls are forbidden in
that path. Backend tests assert Makeup receives the actual completed Natural
portrait and shares its alpha. Thai isolation, exact selected references,
call counts and desktop/mobile selection/download flows are checked separately.

## Previous: AI portrait with measured head adjustment

New English requests use `portraitComposition=en-outfit-body-v1`,
`englishStudioFinishVersion=en-template-locked-body-v3` and
`portraitFramingVersion=outfit-complete-frame-v11-jaw-collar-join`.
This restores AI generation of both the exact selected hairstyle and outfit.
Thai generation and its existing three-call female pipeline are unchanged.

The actual first AI image is now `createEnglishBodyLayout(selectedOutfit)`:
a fixed garment canvas with a neutral head/neck placeholder. It replaces the
customer's full-body photograph as the base image. This is the concrete change
that removes source shoulder/torso size from the garment composition input.
An original identity crop supplies the person's face separately. The exact
catalogue hair, native garment detail (up to2048px) and optional measured scalp
attachment diagram are individually labelled. The template controls shoulder
span, collar, outfit width/height, lower edge and camera frame; the head fits
the garment. Each native garment is positioned with one preserved aspect ratio.
AI reconstruction can still vary fine garment pixels; it is not a pixel copy.

Natural generation includes the reference soft studio skin and complete selected
hair/outfit. Makeup edits that same completed portrait using the accepted Studio
palette, preserving eyes, skin detail, hair and outfit/frame. Natural/Makeup
share one alpha. Female pairs take two provider calls; male Natural takes one.
No extra polish, skin-only generation, automatic AI retry, or Thai preparation
reference is called by this path. A new cache/profile prevents reuse of previous
head-only or original-body-conditioned results for an explicit new Create.

Native generation is1824×2432 (3:4,4,435,968px), below the current model's verified
4,624,220px limit. A real provider test rejected2304×3072, so that unsupported
request size is never submitted by production. The English editor backing
canvas retains1824×2432; existing English downloads remain2304×3072 with exact
3:4 geometry. Export dimensions are not a claim of extra generated detail.

Measured head adjustment is restored for complete AI portraits and available
through **Balance head size**. AI instructions alone cannot guarantee the face/
shoulder ratio: the actual output is measured and fitted toward0.30. One
isotropic head transform preserves the scaled jaw contour. Below that measured
jaw, neck skin joins smoothly to the first actual collar row identified in the
same semantic mask. This keeps skin seated in high collars without a horizontal
chin ledge or a transparent collar slot. Both finishes reuse the same mapping/
alpha; labelled clothing and the lower body stay unchanged. A real1824×2432
provider pair was reduced by16.4%; all1,676,071 labelled clothing pixels remained
identical, and both output mattes stayed equal. Moving neck pixels never sample fixed
collar fabric; the old wider-alpha restoration at the chin has been removed
because it produced a horizontal neck ledge. Missing optional measurements
leave the valid original portrait available instead of failing the AI job.

Normal outfit selection on an AI portrait opens AI setup. Changing the outfit
creates that selected AI garment; no PNG is placed over an existing AI outfit.
The pending selected hair survives outfit changes. Repeating the same outfit,
hair and compatible finish can reuse only its own v3 pair. Explicit manual
editing and older saved head/PNG projects retain their compatibility paths.
Download previews, watermarks, payment and ownership checks remain in place.

Validation:54 focused Node checks cover actual payload construction, identical
base geometry for different source body shapes, exact selected references,
one/two-call budgets, pair alpha, head/clothing protection and Thai isolation.
Desktop/mobile UI regressions cover hair retention across outfit changes,
AI creation for changed outfits, identical-selection reuse, head adjustment,
Undo/Redo, finish switching and both-language preview/payment/download flows.
Real provider QA uses public samples in an isolated function; App account,
wallet, payment and AI-job APIs are mocked during browser regression tests.

## Compatibility: close-up head plus one native garment

Previously deployed English requests use `portraitComposition=en-head-template-v1` and
`englishStudioFinishVersion=en-reference-head-detail-v2`. Those saved head/PNG projects remain readable. Thai
generation, prompts, cache and anatomy are unchanged.

The previous full-person generation devoted fewer native pixels to the face.
Its later local head reduction resampled those pixels, and the protected-neck
alpha rule could leave a horizontal neck ledge. Manual PNG selection also left
the generated outfit in the underlying person image, producing two collars or
shoulder outlines. Prompt-only retouch changes did not address those causes.

AI now generates a large, detailed head/hair/neck master at 1728×2304, using the
original upload, optional identity crop and the same exact picker hair/personal
attachment guides. The selected garment is validated but never supplied to AI.
Natural uses the reference adaptive soft studio skin. Makeup uses the actual
review **Studio** palette (sheer pale pink eyelids, #FF747F inner/#F0A2A8 outer
lips), rather than the separate combined-test route's peach pigment overrides.
Both stored variants share alpha; female pairs still take two provider calls,
male Natural one. No retry or partial-pair delivery was added.

The frontend removes obsolete clothing below the chin through alpha only and
keeps native RGB/detail. It never applies the legacy head/neck pixel warp to
this mode. `fitEnglishHeadTemplate` places the entire unmodified garment with
one native aspect ratio and its complete lower edge, then fits the whole head
with one isotropic transform toward face/shoulder ratio0.30. Tall crowns may
reduce that target to preserve headroom. No separate face, jaw or neck warp. English native export is 2304×3072 to
retain the scene’s exact 3:4 aspect; Thai retains its established export size.

`englishNeckClipMask` is an automatic alpha mask derived from the **actual
native garment rows** and native semantic evidence. Above the real collar the
neck contour is untouched; below it, exposed source shoulder skin ends behind
the garment's outer silhouette. Hair is exempt so selected long styles retain
their lengths. This avoids a rectangular neck crop or invented skin patch.
The mask is applied identically in the editor, previews and export, retained
when switching Natural/Makeup, and regenerated transactionally for a new PNG.
It has explicit saved-project/transfer/resource validation and thumbnail support.

Native head and garment sources remain separate layers. Changing a PNG, or
using Create with the same current head/finish and a different garment, reuses
the completed pair without another AI job. The immediate preview/full-quality
download guard, history, ownership, debit and watermark flows remain in place.
Opening older work does not silently regenerate it; explicit Create upgrades
an older profile. Already resampled old images cannot acquire missing detail
merely by refreshing the page.

Validation includes actual head-only provider samples, native PNG pair/alpha,
51 focused Node checks, and actual App desktop/mobile with pinned real models.
For the actual female sample, the retained native face width was about764px;
the checked central facial RGB region was bit-identical to the provider output
after cleanup. This is a region/pixel preservation check, not an image-quality
score or a claim that independent AI runs match exactly. App checks cover one
visible native garment, bow and V-collar swaps, finish switching, automatic mask
save/restore, Undo/Redo and zero extra AI jobs during reuse. Both-language
preview/payment/download regressions also pass. Provider QA uses public samples
in an isolated function; all App account/payment/job APIs are mocked in UI tests.

## Legacy full-person generation

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

Background removal retains the complete person. Measured head correction keeps
the AI clothing, original chin position, supporting neck and person canvas.
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
Provider rendering is mocked in these regression checks.

English head/body balance is requested during the original generation and
enforced locally on completed oversized portraits. The browser does not submit
a second automatic proportion-correction job or reject a completed
Natural/Makeup pair based on shoulder-silhouette ratios.
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

English anatomy generation now uses the uploaded image directly. It performs
natural skin retouch, hairstyle, neck and outfit synthesis in that one request,
then makes the separate stored makeup variant when requested. The legacy Thai
skin-preparation and post-polish passes are excluded from English generation to
avoid feeding an already regenerated body back into anatomy synthesis. The
faceless composition guide distinguishes the short neck above the collar base
from upper-chest skin inside an open V. No generated face is pasted onto the
portrait. Real-provider intermediate images are
still needed to attribute a particular failed portrait to one AI pass.

The English pose instruction separates recognisable facial identity from source
head pose: roll/yaw/pitch are neutral, eye centres level and facial axis upright.
The compact-neck guide includes level eye markers and a vertical nose axis;
these are pose cues, never facial features to copy into the result. Delivered
English layers retain the anatomy/framing policy version. Selecting Create
portrait explicitly regenerates a matching outfit made under an older policy;
matching current-policy output is still reused. Opening a project never triggers
AI generation automatically. Thai generation, prompts and cache stay unchanged.

The English composition target now reduces the whole head by 10% in both axes.
The guide keeps its original camera frame, chin anchor, neck and garment scale;
only the head and its pose markers become smaller. The prompt explicitly avoids
applying that reduction twice or recalculating neck length from the smaller face.

## Measured head correction

The previous `balanceEnglishPortrait` returned the image without changing it;
the 10% prompt alone could still deliver an oversized head. The v8 framing
policy now measures native face landmarks against the transparent shoulder
silhouette. It includes shoulders touching the frame edge and uses a fixed
body-height window, so shrinking the head cannot alter the measurement window.
Already balanced or unmeasurable results are retained.

For oversized heads, `src/english-head-balance.js` applies one uniform scale to
the skull, face and hair about the original chin, targeting a face/shoulder ratio
of 0.30. The short join below the chin eases into the original neck width.
Segmentation protects every clothing pixel, accessories and bare shoulders;
the supporting neck alpha is retained. Pixels below the join are unchanged.
Natural is the existing pair's geometry authority: exactly the same mapping and
alpha are used for Makeup, retaining its cosmetics. Native canvas size, garment
placement and layer transforms stay fixed. This adds no provider request, debit,
regeneration or delivery gate. A local model/encoding failure retains the whole
original pair; cancellation or account changes still abort the stale operation.

Existing English full-person layers expose **Balance head size** in selected
layer properties (on mobile, select the portrait and open Move). It adjusts both
stored finishes together, supports Undo/Redo and records a version to prevent
repeated shrinking. Pixel-edited layers must first undo those edits. Opening a
saved project never automatically alters it or submits generation. Thai
generation and head geometry are unchanged.

Validation includes native pixel/geometry tests and actual App/Studio handlers
on desktop and mobile, including paired finish switching, Undo/Redo, cancellation,
measurement failure and no additional API requests. A separate photographic
check uses the actual pinned MediaPipe models on three local public sample
portraits with a controlled oversized head: remeasured face/shoulder ratios
0.3674→0.3003, 0.3664→0.2993 and 0.3580→0.3004. All labelled clothing and
lower-body pixels stayed identical. These are controlled local samples, not a
new provider run on the user's attached screenshot.

- `node --test tests/english-head-balance.test.js tests/english-proportions.test.js tests/english-completed-delivery.test.js`
- `HEAD_BALANCE_BASE=http://127.0.0.1:5173 python tests/english-head-balance.browser.py`

## English soft studio finish (11 November 2026)

New English requests explicitly send `englishStudioFinishVersion=en-reference-soft-matte-pair-v1`.
They take a dedicated branch before Thai skin preparation, Thai prompt assembly,
skin-board loading, neckline/cutout guide loading and discarded prompt rewriting.
Queued older requests keep their released path. Thai request fields, skin/makeup
policy, cache key and generation stages are unchanged.

The shared skin/light section is derived from the user's supplied
`review-portrait-finish.js` (SHA256
`c604003378f80d5017e1a18e53f284521c2ea6928b3a89ab4d2c855ab7d6a583`).
The full reference is separated into skin and cosmetics in
`english-studio-finish.js`. Natural completes adaptive, authentic-complexion,
soft-matte fine-textured skin with the hair/neck/outfit generation; it adds no
brow reconstruction or cosmetic pigment/gloss. The accepted garment still
controls clothing appearance and established lighting. Makeup uses that completed
Natural image once, applies the reference feathered brows, sheer eyelid finish,
neutral lower-eye skin and glossy lips, and locks the finished skin/light/hair/
neck/garment. The experiment's final #DD9C8C at40% pigment opacity for upper lids
and inner lips, #F0A2A8 outer lips, and neutral inner-corner sheen are retained.
Its cosmetic shimmer cannot change iris colour, gaze or actual eye catchlights.
The previous additional fairer-than-Natural foundation/0.4–0.6EV fill is omitted
from this version only.

English female jobs retain two provider requests and two stored PNGs; English
male Natural needs one. Both female images complete before delivery. A failure
cannot publish a partial pair or trigger extra automatic AI attempts. The same
stored pair still supports immediate finish switching, history and saved work.
New profile/version metadata survives job restoration and layer/history saves.
Explicit Create refreshes an older matching policy; opening saved work does not
regenerate it. Existing credit, ownership and download rules stay in place.

For a newly selected hairstyle, optional cached source-face/segmentation evidence
builds a neutral personal placement guide. The exact picker hair is aligned to
the source eye axis using the guide manifest's donor landmarks. A predominantly
bare connected upper head contributes its measured scalp outline; an existing
large hair mass or clipped crown is not mislabelled as a skull measurement.
Hair can cover the bald/receding scalp instead of stacking above it. The guide
contains no face photograph, adds no provider request, and is never pasted into
final pixels. Failure to obtain optional evidence/guide assets retains the
ordinary generation path. Keep-current-hair bypasses this new-hair guide.
The composition guide and measured English head correction remain authoritative
for final framing/head-to-body size; personal guide relationships follow that
same pose/scale. Guide fields are discarded from completed/failed job metadata.

The frontend skips unused Thai background/template preloads and eager source
segmentation for English. Actual hair-fit evidence and head balancing load
segmentation only when used. Native paired PNGs are encoded directly instead
of a redundant full-resolution alpha repaint and Natural canvas re-encode.
Multipart bounds now allow the complete legitimate English selected-hair/owned
work request (20 fields,24 parts, unchanged two-file/20MiB limits); the prior
12-field bound rejected the expanded valid request. If a server-pinned input
differs, the stale optional hair evidence is discarded with its identity crop.

Regression coverage includes exact request counts/roles, no Thai-only assets,
actual browser multipart submission through the real Multer limits, original
upload preservation, bald/no-hairline evidence, optional failure, paired alpha,
atomic failure, existing-hair reuse, head balance and mobile/desktop UI/downloads.
These local regressions use inert provider responses; separate provider smoke
artifacts document actual image generation rather than treating mocks as visual
quality proof. A one-image prototype's latency is not promised for a two-image
pair.

The isolated live smoke used the same Seedream Flash model and the actual
English helper/prompt/transport code, with public photographic samples: one
female Natural/Makeup pair and one originally bald male with the selected buzz
cut. All three provider requests completed; native outputs were 1728×2304,
and the female pair had identical alpha. Source MediaPipe measurements identified
the male's bare scalp with 21 outline points. Visual inspection confirmed hair
attachment in that sample and visible brow/lid/lip changes over the shared
skin finish. Individual provider requests took about 26–29 seconds in this run;
these timings exclude frontend work/queueing and are not a latency guarantee.
The one-shot QA function was made inert after the three-request run. It touched
no customer job, payment or wallet. Mobile/desktop App and multipart tests use
mocked APIs separately; they are not represented as live customer generations.
