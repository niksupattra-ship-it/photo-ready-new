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

## Shared PNG placement for Thai and English (10 November 2026)

The English manual path now starts the same cancellable display-preview transaction as Thai. Previously it waited for the original PNG and face fitting before drawing anything, and it could block another outfit click throughout that wait. A visible catalog image seeds the bounded preview cache at the actual click. Its complete natural pixels are copied into a preview-owned canvas: a catalog DOM image's layout width (96 px) is not a valid native source width for the scene painter.

Pending suits use a display surface at most 900 px wide, with unchanged scene coordinates, rather than redrawing an export-size canvas for a 512 px thumbnail. Native images, masks and final exports keep their existing dimensions. The temporary surface and its buffers are released on replacement, completion, failure or unmount. Save/download guards still prevent provisional pixels from entering a saved project or exported photo.

English previews preserve the PNG's native aspect and use the existing collar placement plan. A simple below-chin preview paints before face inference; the preview and full PNG then share the same measurement. Loaded head images are passed as decoded images, without trying to load an HTML image object as a URL. Exact unchanged face pixels share inference; edited pixels invalidate it. The single cached pixel snapshot is capped at four million pixels; larger originals use the existing direct detector path. Missing or unusable face evidence retains the ordinary native-aspect fallback. The head's pixels and transforms remain unchanged by manual placement. The fit tag is now `native-aspect-below-chin-v2-shared-face`; choosing a previously placed older PNG explicitly repairs its fit once, without automatic regeneration on project open.

Both Studio and Thai Easy mode can replace a pending suit with another choice. A superseded load cannot overwrite the last choice or enter undo history; a repeated choice of the already placed manual PNG cancels a pending replacement. Native-load errors and suit-policy rejection restore the previous full-quality work and allow retry. Selecting a PNG never invokes portrait AI.

`tests/suit-instant-preview.browser.py` covers Thai Studio/Easy and English processed/manual-source placement with original PNG requests held, changed canvas pixels before delivery, rapid selection, native 1504 × 1285 commits, history, rollback/retry, unchanged portraits, and actual face-cache invalidation. APIs, account/payment actions and AI are blocked or replaced with inert fixture callbacks. Observations describe local fixtures with already visible thumbnails; they are not network or device latency guarantees.

The final local run passed all 7 cases (28 measured paints): 78.0–194.8 ms, median 108.2 ms, with full PNG responses held.
