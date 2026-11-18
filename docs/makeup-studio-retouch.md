# Makeup studio complexion

Newly generated Makeup portraits use one shared final skin directive in both Thai and English. It requests a radiant, hydrated, softly diffused studio complexion, repairing conspicuous surface wrinkles, pimples, acne marks, patchy redness and coarse skin texture. Delicate photographic microtexture and the person's own complexion remain, with sharp eyes, brows, lashes and lip borders. Full-face treatment continues through ears and the visible neck to avoid isolated patches or a jaw/neck seam.

The retouch changes skin appearance through tone and light, without reshaping the face, inflating cheeks, changing identifying features, whitening skin, or relighting clothing/background. Selected hairstyle and under-ear/neck boundary requirements remain binding; the single-pass pipeline still appends its final hair authority after the skin directive.

## Routes and reuse

- `onePassSkinQualityPriority('makeup', english)` applies the directive to single-pass Makeup generation. The Natural prompt bytes and its global quality version remain unchanged.
- `createAiMakeupVariant` appends it after older Thai/English complexion locks. This also covers Natural-to-Makeup and legacy paired-finish processing.
- Only explicit female Makeup result and hairstyle caches receive the new Makeup version. Natural/male cache identities and persistent submission/recovery identities remain unchanged.
- Completed saved images and completed alternate finishes are reused as before; this revision does not regenerate purchased work on reopen. A newly requested Makeup generation receives the revised instruction.

No additional provider request, local skin filter or facial overlay is introduced. Existing codec, alpha and outer-edge handling remains in place. Prices, credits, entitlements, retention and source-photo ownership are unchanged.

## Verification

`npm run build` includes regression tests for the shared instruction's order, actual Thai/English pipeline requests, completed-Natural input, provider call counts, error propagation, image dimensions/alpha, exact interior fixture pixels and unchanged Natural/cache/recovery identities. Existing finish-switch, server-finished delivery, native English pixels, hairstyle boundaries and recovery tests remain enabled.

These tests use an inert image provider and real image codecs. They verify the application paths and preservation guarantees, not a live AI provider's visual interpretation of skin retouching. No customer job, payment or live paid generation is used for verification.
