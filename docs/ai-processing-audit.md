# Natural and Makeup pipeline audit

Baseline: `24b9d33`. Applies to the current female `studio-original-ai-v5`
Natural and Makeup paths, including selected hairstyles.

## Necessary stages retained

| Stage | Purpose |
| --- | --- |
| Original-source and ownership validation | Keep the same uploaded person and existing download rights. |
| AI edit 1 | Prepare skin and studio lighting on the intact clothed original. |
| AI edit 2 | Produce the selected Natural/Makeup finish, hairstyle and neck backing. |
| MODNet and alpha cleanup | Remove the temporary background while retaining native RGB. |
| Clothing/neck alpha cleanup | Prepare the same transparent portrait for the unchanged outfit. |
| Facial feature, proportion and clothing checks | Reject changed features, invalid cutouts or residual garments. |
| Composition, hydration and delivery settlement | Keep the same placement, output pixels and entitlement behavior. |

The two AI edits do different work. Combining them would change the request and
could change the image. Prompts, models, references, image order, provider inputs,
generation count, matting and pixel-edit algorithms remain unchanged.

## Work removed

- Repeated native landmark inference and image decoding for the same immutable
  Blob during leveling, cleanup, feature checks, completion and placement.
  Reuse is per Blob with weak keys. Changed pixels use a new Blob; failed or
  missing-face measurements are evicted. Normalized eye/feature measurements
  remain separate and all their tolerances are unchanged.
- V5 source-hair segmentation and comparison that could not reject a result.
  Legacy unchanged-hair rejection and replacement-image hairstyle matching
  remain active. Hair evidence canvases are built only when a check uses them.
- A second full-size hair-mask read during clothing/neck cleanup.
- Decoding the just-encoded server PNG to calculate RGB statistics that were
  discarded. The same alpha min/max is now collected during the existing alpha
  cleanup loop; opacity/empty-image rejection and PNG encoding stay unchanged.

## Validation

Actual native MediaPipe inference in a mobile Chromium viewport, replaying the
same retained real AI outputs through the App and its final compositor:

| Measurement per sample | Before | After |
| --- | ---: | ---: |
| Native landmark inference, Natural and Makeup | 7 | 3 |
| Normalized protected-feature inference | 2 | 2 |
| Person segmentation, Natural and Makeup | 2 | 1 |

For both finishes, master PNG bytes, decoded RGBA pixels, final composite PNG
bytes, dimensions and placement were identical. The server comparison covered
24 combinations of both finishes, default/selected hair, real returned images
and valid/invalid matte fixtures: provider payloads, stages, error messages and
encoded PNG bytes matched the baseline.

`node scripts/check-portrait-optimization.mjs` freezes provider-payload and PNG
fingerprints from the baseline and checks analysis-cache isolation/retry,
current and legacy quality guards, and invalid-alpha rejection. Original-AI,
Natural source-eye, staged-pipeline, cancellation and model-readiness checks
also pass.

Comparisons replay the same AI responses to isolate the optimization from the
provider's nondeterministic generations. They do not promise that separate new
AI requests will produce identical pictures.
