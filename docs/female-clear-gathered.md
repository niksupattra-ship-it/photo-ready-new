# Female V5 clean skin and gathered hair refinement

This change starts from the restored skin-before-hair V5 baseline, not the withdrawn hair-first implementation. The two calls remain: original clothed photo skin/light preparation, then head/selected hair/neck generation, followed by matting and outfit composition. Model, reference ordering, cosmetics, payments and downloads are unchanged.

The refined `studio-original-ai-v5-clear-gathered-v1` version prevents old V5 results from satisfying the new finish cache. Saved V5 metadata remains readable. Male processing and female V1–V4 prompts remain unchanged.

Both current female prompts remove all moles, freckles, dark/red spots, acne scars/marks and unwanted skin wrinkles. The appended identity and guide instructions no longer introduce conflicting stable-mark preservation. Original eyes, real eyelid folds, brows, lashes, nostrils, lips, expression and anatomical facial proportions remain protected.

Only gathered/default gathered designs receive the final explicit no-neck-hair instruction: remove hanging source lengths, thin neck strands, rear curtains and tails; replace them with matching neck skin inside the backing and blue background outside. Selected long styles retain their actual length. The actual App completion check rejects a connected lower-neck strand as well as a broad curtain for the refined gathered version; isolated segmentation noise is ignored. This check rejects a mismatch and never cuts neck skin, paints replacement pixels or adds a provider retry.

Verification: `scripts/check-female-clear-gathered.mjs` exercises 16 real production orchestration fixtures across finishes and default/gathered/long/free-PNG hair, strict strand/noise evidence, actual App completion and cache invalidation. Existing portrait anatomy, original AI, source-eye, shared-base and gathered-neck checks remain in place. Provider calls are inert; visual model output is not verified by these tests.
