# Earlier feedback when choosing outfits and insignia

This change starts from `f0f65f93103f8d40827fded4f8b4bdaf4e8af19e`. It extends the existing provisional suit drawing to Easy mode and adds temporary thumbnail-based drawing for collar pins, chest pins and ribbons. Full-resolution assets remain the only sources committed to editor state/history and PNG export. Photo processing, account/payment APIs and managed Environment configuration are untouched.

## Behavior

- A loaded outfit choice image seeds the existing bounded display cache. Easy mode now uses the same temporary outfit drawing as Studio while the native template loads.
- Visible insignia choices warm their small existing thumbnails, including both collar-pin sides. Easy-mode insignia choices also use the existing thumbnail catalog rather than full PNGs for their menu images.
- Insignia previews use the same placement calculation as the full asset, with bounded display canvases. Full detail replaces the preview after the native source has been prepared and hydrated.
- Temporary previews live outside editor state and history. Existing save/export/automatic-download guards also cover pending insignia previews. Editing remains locked while the native asset is being committed, preserving full-quality edit/export behavior.
- Immutable alpha-cropped source images have a bounded 16 MiB/24-item cache, separate from per-layer masks and edit buffers. Failure entries can retry. Preview cleanup releases only preview-owned surfaces, not cached source pixels.
- A failed native load removes the provisional drawing and leaves the previous work intact. A subsequent selection can retry. Cancelled or superseded preview work cannot commit.

This improves visible response, not network availability: a first-time choice still needs its thumbnail, and full-resolution loading depends on the user's connection and device. It does not promise zero-delay interaction or allow exporting an incomplete preview.

## Verification

`tests/selection-response.browser.py` exercises the real Studio component, original catalog assets and mocked processed layers. Full PNG requests are deliberately held while thumbnail requests complete. It covers outfits/collar pins/chest pins/ribbons in Easy/Studio at 390px and 1440px widths (16 cases). Every case paints a changed canvas before the full image arrives, retains the old committed state during the preview, then commits the actual native source. Observed first-preview samples were 149–308.8 ms, median 193.95 ms. These local development-fixture observations include browser painting and are not real-phone/network timings or a production SLA.

`tests/selection-response.browser.py --failure` aborts a native chest-pin load after previewing, verifies the prior state is retained, and successfully retries the same option. All external/AI/payment/email requests are blocked.

A separate local audit compared full sources against the pre-change implementation. Collar (2312×2912, including both sides), chest (367×536) and ribbon (335×98) pixels and source frames were identical. Releasing/recreating their previews did not corrupt the cached source. Preview-only source sizes were 578×728, 110×161 and 174×51 respectively.

The existing preview guard test has updated local fixture fields for the current ready/busy/hydration checks. It verifies cancellation, save/export protection and automatic-download behavior. Existing 15 makeup-cache scenarios, English coverage, garment-only preview checks, all 8 government choices for either portrait type, built-language/interface checks and real 2256×3072 PNG delivery with mocked rights pass. The default build passes. No paid AI call, real credit, payment or customer account is used.

No Vite, hosting or Environment configuration is introduced. First/second-pass performance work and restored male government choices remain intact.
