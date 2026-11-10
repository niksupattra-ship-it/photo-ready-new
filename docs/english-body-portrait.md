# English AI clothed portraits — direct delivery restored

Only `?lang=en` submits `interfaceLanguage=en` and
`portraitComposition=en-outfit-body-v1`. Thai processing remains unchanged.
English choices include job outfits only, accepting both PNG and WebP templates.
New English projects start on white; saved background choices are retained.

AI creates the head, neck and clothed torso together from the person and selected
outfit. Reference images retain up to 2048 pixels for fabric, buttons and
insignia. The outfit controls colour/light; face and neck adapt to it. The head
size preference remains 10% smaller relative to the torso, expressed in the
generation prompt. It does not independently resize the face in the browser.

Completed AI results now deliver directly. The later proportion measurement,
second AI correction request and hard rejection gate have been removed. They
could turn an already completed portrait into a generic processing failure.
Polling and credit confirmation also ignore legacy `proportion_correction`
flags, so old pending flags cannot trap an otherwise completed image. Existing
ownership, real job-failure checks, credit reservation and single-refund
cancellation behavior remain intact. No fake result replaces provider failures.

Final placement retains the visible-alpha cover fit: the body fills the frame
width and bottom, with headroom above the crown and a uniform X/Y scale. Both
natural and AI makeup variants remain available, in one person layer, with no
local original-template replacement or neck-mask reconstruction.

Checks:

- `node --test tests/english-delivery-recovery.test.js tests/english-body-portrait.test.js tests/ai-makeup-pair.test.js tests/english-portrait-frame.test.js`
- `node scripts/check-shared-natural-portrait.mjs`
- `TEST_DATABASE_URL=<development database> node scripts/check-english-delivery-recovery.mjs`
- `SELECTION_BASE=http://127.0.0.1:5193 python3 tests/english-body-response.browser.py`
- `./node_modules/.bin/vite build`

The recovery checks execute actual polling, delivery and PostgreSQL settlement
code, including obsolete flags, pair preservation, owner validation, no second
charge and cancellation refunding once. Provider payloads use inert responses;
real AI service behavior and deployment still require separate verification.
