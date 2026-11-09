# English portraits with original outfit pixels

Only `?lang=en` submits `interfaceLanguage=en` and
`portraitComposition=en-outfit-body-v1`. Thai requests keep their existing
head/neck generation and composition. The English catalog allows job outfits,
one female civil-service trial (`female-operational.png`) and one Rajabhat
female student trial (`female-rajabhat.png`). Other government/student paths
are rejected by the English request validator.

AI receives the selected outfit, optional hairstyle, original identity and skin
references. It creates only the head and neck, fitted and lit for the real
outfit. It must not redraw fabric, buttons, insignia, text or the torso.
Background removal and paired AI makeup run as before. The makeup request also
receives the selected outfit as a lighting reference; it omits the independent
+0.4–0.6 EV flash instruction.

Before delivery to the editor, the browser removes any generated clothing,
measures the face and original garment collar/shoulders, and fits the head using
one uniform scale and translation. It draws the ORIGINAL full-resolution
outfit last, with no filters, recolouring, relighting, sharpening or local
warps. The makeup version uses exactly the same placement and original outfit.
Opaque clothing pixels therefore come from a normal raster rendering of the
real template, rather than AI reconstruction. Placement/export may resample
pixels; this is not a promise of matching the original file byte for byte.

The result remains one transparent person layer. The separate suit layer is
hidden selection metadata; changing the outfit queues the existing processing
and credit flow. Makeup switches reuse the prepared pair. Saved layer metadata
and job status retain the composition version. A new English rendering cache
version prevents reuse of earlier AI-generated clothing; Thai cache keys stay
unchanged.

Validation:

- `node --test tests/english-body-portrait.test.js tests/ai-makeup-pair.test.js tests/portrait-collar-reference.test.js`
- `node scripts/check-shared-natural-portrait.mjs`
- `node scripts/check-portrait-uniform-fit.mjs`
- `node scripts/check-gathered-hair-neck.mjs`
- `node scripts/check-portrait-anatomy.mjs`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/english-original-outfit.browser.py`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/english-body-response.browser.py`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/head-only-suit-fit.browser.py`
- `./node_modules/.bin/vite build`

The original-outfit browser check executes the actual App restoration function,
using synthetic head/landmarks with real suit, civil-service and Rajabhat PNGs.
It verifies 4,743,076 opaque original garment pixels per finish (natural and
makeup), preserved aspect ratio, transparent background and job metadata.
Provider payload tests use inert responses, not paid AI calls. Real AI face/neck
quality and production deployment remain separate checks.

The older `check-female-finish-integration.mjs` has seven pre-existing failures,
including missing injected dependencies and obsolete finish expectations. The
same seven cases fail against pre-change `main.jsx` from `e1409c2`. The current
shared-portrait suite above covers paired AI finishes.
