# Real collarless female government references

The former v1 changed only a supplemental neckline panel, while the primary outfit and layout still contained the pointed inner shirt collar. New Thai female requests use `thai-female-no-inner-collar-v2-primary`: the primary outfit, body layout, both fidelity detail crops and supplemental neckline now come from the same locally edited original garment.

`node scripts/build-real-collarless-outfits.mjs` deterministically derives the four lossless WebP files from the original catalogue PNGs. It retouches only the two inner collar regions using neighbouring real fabric colours, preserving transparency, the black tie and all visible pixels outside x710–1339, y180–940. The shoulder boards, rank artwork, jacket silhouette and buttons retain their original pixels. No generated outfit image is used in v2. Existing v1 requests retain their previous contract; English references remain original.

Thai Studio native outfit loading uses the same real derivative and includes its resolved source path in the prepared-asset cache key. Desktop Easy Mode opens the government insignia chooser when a result becomes available and after processing, while allowing it to be closed. Mobile keeps its existing icon toolbar.

Validation: original-versus-derived pixel and alpha invariants for all four garments; actual production request preparation with an inert provider and required makeup policy audit; full prebuild/build; desktop/mobile result actions and real insignia layer/browser gestures. These checks do not claim a live AI provider has generated a visually correct new customer portrait.

## V3: AI-only construction supersedes local cloth retouch

New submissions use `thai-ai-garment-rear-hair-v3`. They send the untouched original real garment and its two original detail crops. Neither the locally retouched v2 garment nor the generated v1 supplemental panel is used for new submissions. AI reconstructs the requested inner-collar exception within the original complete portrait generation. Studio native layers also return to the untouched original catalogue source. Historical queued v1/v2 retain their own request semantics.

The final v3 instruction, after face policy normalization, requires both long hair lengths behind both shoulders and the opaque jacket, explicitly overriding front-draped placement in source/hairstyle/makeup references while preserving the chosen cut and original face. It prohibits post-generation cloth overlays or hair masks. The existing complete-portrait output path and mobile/desktop result controls remain in place. Production-wrapper regression verifies the actual provider request's garment pixels match the original PNG, its detail reference has only two panels, and only the original provider calls occur.
