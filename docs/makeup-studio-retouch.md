# Makeup studio complexion

Newly generated Makeup portraits use one shared appearance specification in both Thai and English. Version `makeup-studio-retouch-v2-reference-soft-satin` follows the supplied portrait's softly diffused studio finish: smooth clear skin, broad soft frontal light, restrained luminous satin, faint blended rosy cheeks, natural brows and lashes, neutral pink-brown lids and muted pink satin lips. Surface wrinkles, pimples, acne marks, patchy redness and coarse texture are repaired before adding cosmetic colour. Full-face treatment continues through ears and the visible neck, while eyes and lip borders stay sharp.

The previous implementation appended a stronger skin directive after conflicting Natural, thin-foundation, pressed-powder, fixed-exposure and route-specific cosmetics instructions. This revision selects a Makeup-specific base context and uses the shared specification for skin, light and cosmetic colour together. Makeup no longer inherits Natural's small-correction/uneven-pore restrictions or different wet-gloss and hardcoded pigment palettes from each route. Natural's default prompt bytes remain unchanged.

The retouch changes skin appearance through tone and light, without reshaping the face, inflating cheeks, changing identifying features, whitening skin, or relighting clothing/background. Selected hairstyle and under-ear/neck boundary requirements remain binding; the single-pass pipeline still appends its final hair authority after the skin directive.

## Routes and reuse

- `onePassSkinQualityPriority('makeup', english)` returns the shared Makeup specification, with the English garment lock where applicable. Base prompt builders receive an explicit Makeup context without the default Natural skin instructions. The Natural prompt bytes and global quality version remain unchanged.
- `createAiMakeupVariant` uses a short edit context, mode-specific head/outfit/silhouette protection and the same shared specification. This also covers Natural-to-Makeup and legacy paired-finish processing. Former Thai/English complexion locks and separate cosmetic palettes are not part of its active request.
- Only explicit female Makeup result and hairstyle caches receive the new Makeup version. Natural/male cache identities and persistent submission/recovery identities remain unchanged.
- Completed saved images and completed alternate finishes are reused as before; this revision does not regenerate purchased work on reopen. A newly requested Makeup generation receives the revised instruction.

No additional provider request, local skin filter or facial overlay is introduced. Existing codec, alpha and outer-edge handling remains in place. Prices, credits, entitlements, retention and source-photo ownership are unchanged. Skin illumination adapts to the source and the selected garment without a fixed exposure increment or a common pale skin target.

The supplied reference was visually analysed to define this text specification. The application does not upload that reference portrait or use its face as a generation input. Text instructions guide appearance; they do not guarantee identical pixels or provider compliance on every source.

## Verification

`npm run build` includes regression tests for the single appearance specification, absence of obsolete Makeup appearance blocks in actual requests, Thai/English pipeline requests, completed-Natural input, provider call counts, error propagation, image dimensions/alpha, exact interior fixture pixels and unchanged Natural/cache/recovery identities. Existing finish-switch, server-finished delivery, native English pixels, hairstyle boundaries and recovery tests remain enabled.

These tests use an inert image provider and real image codecs. They verify the application paths and preservation guarantees, not a live AI provider's visual interpretation of skin retouching. No customer job, payment or live paid generation is used for verification.
