# Makeup studio complexion

Newly generated Makeup portraits use one shared appearance specification in both Thai and English. Version `makeup-studio-retouch-v8-even-skin-eye-mouth-retouch` follows the supplied portrait's softly diffused studio finish: natural photographic texture, broad soft frontal light, controlled dewy reflections on the forehead, nose, cheekbones and chin, translucent peach-pink cheeks, natural brows and lashes, warm peach-beige lids and translucent coral-pink lip gloss. Surface wrinkles, pimples, acne marks, patchy redness and coarse texture are repaired before adding cosmetic colour. Full-face treatment continues through ears and the visible neck, while eyes and lip borders stay sharp.

The previous implementation appended a stronger skin directive after conflicting Natural, thin-foundation, pressed-powder, fixed-exposure and route-specific cosmetics instructions. This revision selects a Makeup-specific base context and uses the shared specification for skin, light and cosmetic colour together. Makeup no longer inherits Natural's small-correction/uneven-pore restrictions or different wet-gloss and hardcoded pigment palettes from each route. Natural's default prompt bytes remain unchanged.

The retouch changes skin appearance through tone and light, without reshaping the face, inflating cheeks, changing identifying features, whitening skin, or relighting clothing/background. Selected hairstyle and under-ear/neck boundary requirements remain binding; the single-pass pipeline still appends its final hair authority after the skin directive.

## Routes and reuse

- `onePassSkinQualityPriority('makeup', english)` returns the shared Makeup specification, with the English garment lock where applicable. Base prompt builders receive an explicit Makeup context without the default Natural skin instructions. The Natural prompt bytes and global quality version remain unchanged.
- `createAiMakeupVariant` uses a short edit context, mode-specific head/outfit/silhouette protection and the same shared specification. This also covers Natural-to-Makeup and legacy paired-finish processing. Former Thai/English complexion locks and separate cosmetic palettes are not part of its active request.
- Only explicit female Makeup result and hairstyle caches receive the new Makeup version. Natural/male cache identities and persistent submission/recovery identities remain unchanged.
- Completed saved images and completed alternate finishes are reused as before; this revision does not regenerate purchased work on reopen. A newly requested Makeup generation receives the revised instruction.

No additional provider request, local skin filter or facial overlay is introduced. Existing codec, alpha and outer-edge handling remains in place. Prices, credits, entitlements, retention and source-photo ownership are unchanged. Skin illumination adapts to the source and the selected garment without a fixed exposure increment or a common pale skin target.

The reference portrait was used to define the specification, not uploaded as a donor face. New Makeup requests also use the existing identity-free studio-light swatch board as an illumination/material guide only, without copying any swatch colour. The Thai route reuses its existing board when present; English and completed-Natural edits append the guide last to preserve all earlier reference indices. If the guide is unavailable, the text-only Makeup request still works. The Makeup policy asks for balanced left/right illumination and cosmetic application while preserving original eye, brow, lip, jaw and other facial geometry. No face mirroring, masks, extra generation or post-AI retouch. Natural and male requests and cache identities remain unchanged. V4 adds a final optional Makeup-only check for temporary blemishes after cosmetic application, and omits the redundant legacy Thai skin/light instructions for current single-pass Makeup requests. Provider visual compliance must still be checked with actual results.

## Verification

`npm run build` includes regression tests for the single appearance specification, absence of obsolete Makeup appearance blocks in actual requests, Thai/English pipeline requests, completed-Natural input, provider call counts, error propagation, image dimensions/alpha, exact interior fixture pixels and unchanged Natural/cache/recovery identities. Existing finish-switch, server-finished delivery, native English pixels, hairstyle boundaries and recovery tests remain enabled.

These tests use an inert image provider and real image codecs. They verify the application paths and preservation guarantees, not a live AI provider's visual interpretation of skin retouching. No customer job, payment or live paid generation is used for verification.

## V5 reference-style revision

The latest user-supplied portrait is used to describe the cosmetic colours and surface lighting, not uploaded as a donor face. The makeup-only prompt specifies dewy local reflections and coral-pink gloss instead of satin-only light and muted lip colour. The existing identity-free skin board guides diffuse light and photographic texture only. The direct Thai single-pass Makeup builder no longer includes the older `ORIGINAL_AI_LIGHT` satin directive. Natural and male prompts, existing hair conditioning, outfit geometry, completed work and provider call counts are unchanged. No new face masks, post-processing filters or provider calls are introduced. The tests check instruction consistency and return pixels from a simulated provider; actual visual compliance must be verified separately.

## V6 selected Makeup photo-surface precedence

The opt-in Makeup finish now specifies temporary acne retouch and softening photographic contrast on superficial fine lines in both the main surface specification and the final check. Identity/complexion references do not require copying temporary acne detail. Natural instructions are explicitly inactive during selected Makeup; hair and garment constraints protect the finished appearance rather than the original skin surface. The existing face, true age, anatomical folds, identifying marks, natural skin texture, and dewy peach/coral cosmetic palette remain protected. Both direct generation and the completed-Natural edit use this same policy. Only the Makeup cache version changes; previously completed images remain intact. No new masks, output filters or provider requests are added. Automated tests inspect prompt precedence, not actual rendered skin; live visual results are not yet verified.

## Makeup provider provenance and legacy cache routing

New successful provider requests record the actual canonical policy used. The server distinguishes newly generated results from stored-result reuse, with old provenance reported as unknown rather than rewriting existing images. Explicit Makeup selection bypasses the older browser-only cosmetic path and Natural-only shared cache fallback. No automatic regeneration of stored results or extra provider pass is introduced. The gate checks policy presence before a required one-pass Makeup request, not the returned photograph's visual appearance. Tests use an inert provider; live visual compliance remains unverified.


## V7 brighter smooth skin, balanced brows and lifted lashes

The explicit Makeup finish now requests visibly brighter skin-only midtones,
removal of superficial wrinkles/fine lines, acne and post-acne marks, melasma,
freckles and uneven pigmentation. Previous instructions preserving freckles
and cosmetic brow asymmetry have been removed from the shared authority and
its final check. Identifying moles, underlying anatomy, age structure and the
customer’s undertone remain protected, with fine photographic texture rather
than a waxy overlay. The cosmetic brow pair is matched in apparent thickness,
length, arch balance and tapered tails, with distinct hair strokes and soft
feathered edges. Lashes are fuller-looking, lifted, curled and separated while
preserving eye openings, without a heavy false-lash strip.

This changes only the shared Makeup instruction and its Makeup-specific cache
version. Both locales and direct/completed-Natural generation receive the same
specification. Existing completed results are still reused without automatic
regeneration or charges. Natural/male instructions, prices, entitlements,
source ownership, request counts and hairstyle/outfit protection are unchanged.
Tests inspect real request construction with an inert provider; no live paid
image generation or visual guarantee is included in this verification.

## V8 even skin, eye and mouth retouch

Refines the selected Makeup finish after a customer example showed uneven skin, lower-eye darkness and residual eye/mouth lines. Explicitly corrects under-eye pigmentation and patchy tone, retouches fine crinkled skin and perioral lines, and reduces nasolabial/mouth-corner crease shadows. Removes the broad instruction to preserve defining anatomical folds, which could compete with these cosmetic requests. Upper-eyelid anatomy, feature positions, expression, facial volume, moles and authentic skin undertone remain protected. Deeper crease shadows soften without reshaping the face.

Checks the eye and mouth areas at close portrait scale as well as normal size. Brows, lashes and the existing cosmetic palette are unchanged. Only new Makeup requests use v8; saved results, Natural/male prompts, recovery identity and provider request counts are unchanged. Automated prompt/pipeline checks do not verify the visual result of a live AI generation.
