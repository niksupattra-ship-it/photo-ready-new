# Korean Makeup refinement on the existing shared-base workflow

Keep the deployed shared Natural AI base and local finish switching. This does not introduce independent AI jobs for Natural and Makeup, change processing order or change payments/downloads.

Current original-AI Makeup uses `shared-rose-pink-gloss-v2` (Soft Rosy uses the peach equivalent). It adds a restrained, highlight-protected RGB skin brightness lift, a more visible lower-lip gloss highlight and five groups of three fine tapered upper-lash strokes following the existing lid landmarks. Skin texture samples, eye interiors, face proportions, native dimensions and alpha are retained. Natural restores the original shared base exactly. Older local presets and historical staged palettes keep their previous pixel behaviour.

Both female choices retain the source eye-to-chin length and face aspect ratio. The existing source/output acceptance guard now rejects more than 3% change in eye-to-chin/face-width aspect and more than 4% eye-to-chin change; it does not resize or warp a generated face. Male checks are unchanged.

Browser pixel tests at 384px and 900px verify increased skin brightness, lip gloss and lash definition, exact native geometry/alpha and exact Natural restoration. Existing shared-base, cache, source-eye, anatomy and clear-gathered checks remain. No paid model generation is performed.
