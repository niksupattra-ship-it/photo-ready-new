# Natural and AI makeup from one processing action

New female portrait jobs request `femaleFinishPair=ai-makeup-pair-v6-lifted-blush`. The existing Natural pipeline completes first; an additional AI edit applies makeup to that finished image. Both results must finish successfully before the job completes. This is one user action and one existing credit reservation, with an additional provider call; it is not a single provider generation returning two independent pictures.

`ai_jobs.result` retains Natural, and the additive `result_makeup` column retains Makeup atomically. The existing owned result endpoint accepts `?finish=natural|makeup` with the same trial/ownership rules. Cancelling clears both results. Older jobs without a paired result retain their existing behavior.

The browser applies the same leveling and aspect transform to both results. Makeup uses the entire AI RGB photograph with the cleaned Natural cutout alpha. It never aligns or pastes a separate face, restricts RGB to a face oval, or restores eye patches from the Natural photo. The provider prompt requests subtle everyday makeup with lifted blush blended outward along the cheekbones to the temples and lateral face edges, richer medium rose-pink lips with hydrated gloss, healthy skin and brighter diffused frontal fill-flash lighting (approximately +0.4–0.6 EV in facial midtones when highlights permit), continuous across the face, ears, jaw and neck. It protects skin highlights and natural complexion, without saturated eye rings, opaque foundation or a pale facial patch. This removes the previous face-mask compositing boundary; AI identity and geometry still require real-provider visual validation.

Both native PNG assets persist in saved projects, transfer deduplication, editor framing, history and cache memory accounting. The user's chosen finish appears after processing; subsequent switching uses retained pixels. Existing saved images keep their pixels; a fresh generation uses the corrected whole-image version.

Validation:

- `node --test tests/ai-makeup-pair.test.js tests/promptpay-work-recovery.test.js`
- `node scripts/check-shared-natural-portrait.mjs`
- `node scripts/check-shared-studio-skin.mjs`
- `python tests/shared-studio-skin.browser.py`
- `./node_modules/.bin/vite build`

A local PostgreSQL/HTTP integration check also verified paired persistence, trial headers, wallet isolation and cancellation cleanup. Provider generation was stubbed in tests. Actual AI appearance and latency still need validation with a configured ARK account; no external AI call was made during implementation.
