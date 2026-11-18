# Compact hairstyles: clear under-ear and neck space

The reported braided-crown design (`seedream-41`) has no under-ear neck-side
extensions in either its picker photograph or isolated guide. Earlier prompts
still allowed natural nape/sideburn endpoints and broadly preserved reference
wisps. Thai isolated guides also showed the hair cap without the corresponding
clean ear/neck context. These gave conflicting evidence about the missing hair.

The Thai and English generation routes now end with one shared, kind-specific
boundary after cosmetics and the existing no-bun rule:

- Short/gathered: no visible hair below either lower ear, behind either jaw
  corner or down either neck side. This includes small tufts, hooks, dark strips,
  sideburn extensions and nape columns. Earlier preservation exceptions cannot
  authorize them. The selected crown, fringe, curls and flat braids remain.
- Bob/long: retain the real continuous edge and complete selected lengths;
  prohibit only an added rear layer, invented tail or extra neck-side strands.
- Current hair and female English AI Picks: determine the actual cut from the
  supplied source/current-hair photograph. Apply the compact exclusion only to
  an actually short/gathered cut; genuine bob/long lengths remain protected.

The generic English ear policy follows the same conditional rule. It no longer
instructs every long hairstyle to become gathered. Two stale UI source assertions
in the English auto-hair test were aligned with the released explicit-choice
submission handler; the UI handler itself is unchanged.

Current Thai compact catalogue requests receive a 1024x768 two-panel reference
in the existing hair slot. The complete isolated hairstyle remains on the left;
the matching picker photograph on the right shows the clean negative space
below the ears and beside the neck, with donor facial features blanked. Existing
manifest mappings, dimensions and SHA-256 values are checked before use.
English boards, Thai long/bob guides, original previews, native overlays and AI
reference files are not overwritten. This is conditioning evidence, not a mask
or pixel operation on the generated customer image.

`HAIR_DESIGN_VERSION` advances to
`selected-silhouette-v28-explicit-clean-neck-output`. Explicit selected hairstyles now reject all original hair as hairstyle evidence, including overlapping scalp sections and residual hair behind the ears or neck. The selected reference alone determines the design, endpoints and negative space; the original face and skull determine fit only. Explicit compact selections also receive a final neck-side negative-space instruction; selected long/bob lengths and current-hair/no-selection contracts are retained. These instructions do not constitute a visual validator. New-generation
result/hairstyle caches use that version. Purchased PNGs and stored manual edits
are not relabeled or rewritten. Existing job recovery, pricing, package rights,
credit reservation and payment settlement are unchanged.

## Verification

The focused suite passed 25 tests, including 17 actual pipeline scenarios with
an injected provider, every currently available Thai compact guide, all 33
English board compositions, short/gathered defaults, Natural/Makeup, current
hair, AI Picks and real long/bob preservation. Tests verify final prompt order,
one provider request for each new single-pass scenario, immutable source and
guide bytes, unmodified fixture skin pixels and donor-face neutralization.
Existing single-finish and English proportion suites passed 28 checks. The final
production build, including 70 regression checks, also passed.

```sh
node --test tests/hair-neck-boundary.test.js tests/hair-neck-pipeline.test.js tests/thai-compact-hair-reference.test.js tests/english-selected-hair.test.js tests/english-auto-hair.test.js tests/english-current-hair.test.js
npm run build
```

Provider calls and matting are local fixtures; actual generative-model
compliance has not been visually verified by a paid AI request. No customer
account, real payment or production image was used for testing. Images already
generated retain their existing pixels; applying the new rule requires a new,
explicit generation, rather than an automatic modification of purchased work.
