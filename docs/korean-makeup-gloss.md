# Korean Makeup refinement on the existing shared-base workflow

Keep the deployed shared Natural AI base and local finish switching. This does not introduce independent AI jobs for Natural and Makeup, change processing order or change payments/downloads.

Current original-AI Makeup uses `shared-pink-nude-gloss-v4` (Soft Rosy uses `shared-peach-nude-gloss-v4`). The reference controls the nude-rose colour and natural blending only, never facial identity. It uses blended pink-brown upper lids with a fine brown liner, a more visible softly feathered nude-rose cheek tint, centre-to-edge gradient nude-rose lips, visible hydrated gloss, a subtle highlight-protected RGB skin lift and soft brown Korean lash clusters following existing lid landmarks. Earlier v1/v2 presets retain their pixel behaviour. Skin texture samples, eye interiors, face proportions, native dimensions and alpha are retained. Natural restores the original shared base exactly. Older local presets and historical staged palettes keep their previous pixel behaviour.

Both female choices retain the source eye-to-chin length and face aspect ratio. The existing source/output acceptance guard now rejects more than 6% change in eye-to-chin/face-width aspect and more than 7% eye-to-chin change; it does not resize or warp a generated face. Male checks are unchanged.

Browser pixel tests at 384px and 900px verify increased skin brightness, lip gloss and lash definition, increased lip/eyelid/cheek colour compared with v3 on light and dark skin fixtures, exact native geometry/alpha and exact Natural restoration. Existing shared-base, cache, source-eye, anatomy and clear-gathered checks remain. No paid model generation is performed.

Delivery checks use overall facial geometry, including the existing aspect and eye-to-chin limits. Eye opening, iris size and gaze micro-measurements no longer reject completed AI jobs: these estimates vary with source resolution and cosmetic contrast. The eye/face preservation prompts, garment checks, gathered-hair checks and native-geometry local cosmetics remain in place.
