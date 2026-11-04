# Automatic outfit fitting preserves the original collar pattern

After choosing a garment, automatic fitting now adjusts only the existing head pose. The original garment source pixels, source/collar frames, position, scale and rotation are retained. Automatic collar width and height are zero, and automatic collar flags/warnings are cleared. The rendering warp receives zero values and returns the original garment surface.

The proportional head planner remains unchanged. It aligns the face against the garment's own frame and bounds head size by its shoulders/torso. Head source pixels, masks, identity/job metadata and other layers remain intact. Existing legacy `neck-fit` patch layers tied to this head are removed as before. No new neck fill or clothing distortion is generated.

The fitting version changes to `head-only-fixed-pattern-v4`, so selecting an outfit that still carries the previous automatic-fit version takes the existing repair path rather than the same-outfit early return. This is not a bulk rewrite of saved work. The existing protection for explicit manual edits, locked layers and rights checks remains in the editor. No AI provider, payment API, environment variable or managed Environment configuration is changed.

Validation:

- `scripts/check-head-only-suit-fit.mjs` runs the actual fitting function with measurement fixtures. It checks unchanged garment source/frame/pose, zero collar deformation, head-only movement or preserved head placement, legacy neck-patch removal and no input mutation. A skin-neck profile is no longer required for fitting.
- `scripts/check-studio-suit-fit.mjs` covers 216 geometry plans over all 36 catalog garments, including repeatability, unchanged body frames/poses and bounded proportional heads. Its old 25-item catalog assertion is updated to the actual 36-item catalog.
- `tests/head-only-suit-fit.browser.py` uses real suit, male/female government and graduation PNG assets with local face-landmark fixtures. It checks exact garment pixel equality, original frames/poses, unchanged head source/job and the zero-warp renderer path.
- Default build, English coverage, built-browser language/interface checks, government choices and actual PNG delivery with mocked rights pass.

Browser verification uses local files and fixture responses. It does not invoke paid AI, real payment, email or customer accounts. Templates, outfit-choice thumbnails, preview speed and stable viewport behavior are unchanged.
