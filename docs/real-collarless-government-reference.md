# Real collarless female government references

The former v1 changed only a supplemental neckline panel, while the primary outfit and layout still contained the pointed inner shirt collar. New Thai female requests use `thai-female-no-inner-collar-v2-primary`: the primary outfit, body layout, both fidelity detail crops and supplemental neckline now come from the same locally edited original garment.

`node scripts/build-real-collarless-outfits.mjs` deterministically derives the four lossless WebP files from the original catalogue PNGs. It retouches only the two inner collar regions using neighbouring real fabric colours, preserving transparency, the black tie and all visible pixels outside x710–1339, y180–940. The shoulder boards, rank artwork, jacket silhouette and buttons retain their original pixels. No generated outfit image is used in v2. Existing v1 requests retain their previous contract; English references remain original.

Thai Studio native outfit loading uses the same real derivative and includes its resolved source path in the prepared-asset cache key. Desktop Easy Mode opens the government insignia chooser when a result becomes available and after processing, while allowing it to be closed. Mobile keeps its existing icon toolbar.

Validation: original-versus-derived pixel and alpha invariants for all four garments; actual production request preparation with an inert provider and required makeup policy audit; full prebuild/build; desktop/mobile result actions and real insignia layer/browser gestures. These checks do not claim a live AI provider has generated a visually correct new customer portrait.

## V3: AI-only construction supersedes local cloth retouch

New submissions use `thai-ai-garment-rear-hair-v3`. They send the untouched original real garment and its two original detail crops. Neither the locally retouched v2 garment nor the generated v1 supplemental panel is used for new submissions. AI reconstructs the requested inner-collar exception within the original complete portrait generation. Studio native layers also return to the untouched original catalogue source. Historical queued v1/v2 retain their own request semantics.

The final v3 instruction, after face policy normalization, requires both long hair lengths behind both shoulders and the opaque jacket, explicitly overriding front-draped placement in source/hairstyle/makeup references while preserving the chosen cut and original face. It prohibits post-generation cloth overlays or hair masks. The existing complete-portrait output path and mobile/desktop result controls remain in place. Production-wrapper regression verifies the actual provider request's garment pixels match the original PNG, its detail reference has only two panels, and only the original provider calls occur.

## V4: restore the real shirt collar, prevent duplication

New submissions use `thai-ai-original-single-collar-rear-hair-v4`. The latest user correction requires the actual folded shirt collar from the original real garment: one left/right pair of collar leaves around the tie, with the jacket lapels remaining separate. V4 does not enter the collar-removal gate or send collarless supplemental/retouched references. Its final instruction requires the original collar and forbids removing/flattening it, while replacing all old uploaded clothing so no second collar survives. Rear hair placement, original face protection, original garment pixels and the single AI generation remain unchanged. V1–V3 historical request instructions retain their respective semantics. Cache/submission identities use the existing version field.

Validation includes production-wrapper assertions that the outgoing v4 request contains original garment pixels, only two original detail crops, the restore-collar rule, no remove-collar rule, and rear-hair priority. No paid live customer generation is used by the tests.

## V5: single seam where the shirt meets neck skin

The latest report concerns the narrow pale/differently coloured rim directly against neck skin, rather than fold shadows below the pointed collar leaves. New female government requests use `thai-ai-single-skin-collar-seam-v5`. They retain the original real garment references and both pointed collar leaves, but no longer explicitly request an exposed folded collar band. A final local instruction requires a single direct skin-to-collar seam, rejects an additional collar-shaped band/old-shirt edge, and identifies coloured fringes on the source PNG's transparent neck cutout as extraction artifacts rather than additional clothing.

The final instruction leaves ordinary collar/tie fold shadows and the garment's original colour alone. It does not whiten the whole uniform, remove the real collar, modify face/skin, introduce masks, paste cloth or add a provider call. V4 archived requests preserve their previous wording. Tests check the corrected anatomical location, absence of the conflicting exposed-band wording in new requests, final priority ordering, actual production request preparation and original garment pixels. No paid live customer generation is used in verification.

## V6: clean the real reference neck-cutout fringe before AI

The real transparent female government garment PNGs retain peach/skin-coloured partially opaque pixels at the neck-hole boundary. The photographed double-edge report persists with prompt-only corrections. V6 (`thai-ai-clean-neck-reference-v6`) therefore prepares the selected real reference before generation: it removes only the contaminated transparent-hole alpha fringe within x720–1328/y120–479, with a tapered/feathered boundary. Original RGB values, native dimensions, all other alpha, collar cloth, tie, shoulders and rank artwork remain unchanged. Original catalogue files are never overwritten.

The primary outfit, body layout and original-asset detail crops all use the same cleaned reference. No customer result, face or skin is passed into the cleanup function; no generated reference image, replacement cloth, local colour paint or post-generation garment overlay is added. The final instruction identifies the one clean neck opening and retains the actual shirt collar. V5 and earlier archived requests keep their former bytes. Unrecognised future source dimensions fall back to the original reference instead of failing the request.

Validation covers all four original garments: alpha-only reduction within the narrow neck ROI, zero RGB changes, no added alpha, unchanged source files, unchanged bypasses, actual production request reference bytes, and no additional provider calls. A comparison of the real original/cleaned reference confirms removal of the coloured rim; this is not a live provider output guarantee.
