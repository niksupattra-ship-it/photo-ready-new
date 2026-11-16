# Faster purchased-work reopening

The change reduces repeated reads and preparation while retaining the existing
editor, native pixels, manual layer geometry, source binding, payment checks,
seven-day expiry and atomic editor hydration.

- Thumbnail requests read only the preview blob and access metadata. Image
  downloads read only the requested image. Native recovery and saving edits
  read access metadata instead of the previous full editable project.
- New clients negotiate `X-IDPROM-Native-Recovery: 1`. Historical archives
  without an editable snapshot return their native context in the first editor
  response. The server does not build a flattened PNG for the client to discard,
  and the client does not request the original again through `/edit`.
- Stored and imported snapshots retain the existing project response. Older
  clients retain the previous fallback contract. Missing originals still give
  409; temporary storage failures still give retryable 503 responses.
- Preparation converts each identical data URL to a Blob once per open. Up to
  three independent source/canonical/head reads overlap in the purchased-work
  fast path. Abort, deadlines and all-or-nothing preparation remain enforced.
- Head, suit and background decoding can overlap Blob preparation, after the
  complete project passes resource validation. The existing bounded image
  cache is reused; no extra global cache of customer source Blobs is added.

## Verification

Purchased archive HTTP/context/prefetch/native-open tests plus new preparation
tests passed (45). Actual store SQL projection tests passed (7). Existing
mask (5), saved female-finish (10), snapshot (7) and lossless-transfer (15)
checks passed. Build includes the existing 48 portrait regression gates.

Browser checks mounted the real Studio with deterministic image layers at
390px and 1440px in Thai and English. Original work/canonical binding,
background/head/suit pixel samples and unchanged layer transforms passed with
no runtime errors. No payment or AI generation was invoked.

On an isolated SQL fixture, a thumbnail row decreased from 6,308,407 to 16,783
bytes; access-only metadata was 392 bytes. This measures returned fixture data,
not production database latency.

A local Chromium preparation benchmark used real 900x1200 PNG/JPEG inputs and
60ms simulated latency per data-URL read. Baseline samples were 344/298/235ms;
optimized samples were 143/157/109ms. Reads decreased from three serial reads
to two overlapping reads. Original/canonical/head SHA-256 and project metadata
matched. The median change (298 to 143ms) applies only to this preparation
fixture; it is not an end-to-end production speed guarantee.

```sh
node --test tests/purchased-*.test.js tests/saved-project-preparation-speed.test.js
# PGlite may be installed separately via PGLITE_MODULE:
node scripts/check-purchased-read-projections.mjs
node scripts/check-saved-project-masks.mjs
node scripts/check-female-finish-saved-project.mjs
node scripts/check-studio-snapshot.mjs
node scripts/check-saved-work-transfer.mjs
npm run build
```
