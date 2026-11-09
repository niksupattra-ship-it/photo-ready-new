# English clothed portrait generation

The `?lang=en` client submits `interfaceLanguage=en` and
`portraitComposition=en-outfit-body-v1`, with the selected job outfit in
`neckOutfitReferencePath`. Both fields are required to select this mode.
Thai requests keep their existing head/neck generation and outfit composition.

The generation request uses a dedicated prompt and the real selected outfit,
optional selected hair, original-person identity and skin references. It does
not send the head-only neck diagrams or garment-exclusion instructions. The AI
creates one chest-up clothed person. Background removal still runs, but the
head-only blue-field cleanup is skipped so blue clothing remains intact.
Natural and makeup variants retain the same matte and clothed silhouette.

The browser preserves the AI's head/body proportions and complete garment:
no face aspect restoration, clothing deletion or head-only completion check.
The editor stores one transparent person layer with its composition version and
outfit template. The separate suit layer is hidden selection metadata. Changing
the outfit queues the existing processing/credit flow with the new selection;
it requires AI processing rather than a local instant clothing overlay. Hair
changes also regenerate the clothed portrait. Makeup switches reuse the paired
results. Job status and saved layer metadata retain the composition version.

Validation uses inert AI responses, real outfit reference files, alpha fixtures
(including blue clothing), actual App orchestration and Chromium editor flows.
The browser test also runs the actual App placement/layer functions to verify
that torso pixels survive without aspect distortion or a visible suit overlay.
No paid provider calls were made; real AI output quality and production rollout
still require verification.

Commands:

- `node --test tests/english-body-portrait.test.js tests/ai-makeup-pair.test.js tests/portrait-collar-reference.test.js`
- `node scripts/check-shared-natural-portrait.mjs`
- `node scripts/check-gathered-hair-neck.mjs`
- `node scripts/check-portrait-anatomy.mjs`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/english-body-response.browser.py`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/head-only-suit-fit.browser.py`
- `./node_modules/.bin/vite build`

The older `check-female-finish-integration.mjs` has seven pre-existing failures,
including missing injected test dependencies and obsolete finish expectations.
The same seven cases fail against the pre-change `main.jsx` from `e1409c2`.
The current shared-portrait orchestration suite above covers paired AI finishes.
