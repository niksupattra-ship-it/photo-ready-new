# Reliability audit —13 November2026

Baseline: `ded05650fea53bdbaceb419e046a3a374e04eee7`, matching the public
release when the audit started. Changes apply to the existing Thai/English
application. English v9 generation, cosmetics, outfit catalogue and sizing,
prices, plan quantities, preview/payment order and UI layout are retained.

## Confirmed defects and fixes

- Concurrent optional outfit-AI requests previously reserved three credits and
  made three provider calls for three simultaneous requests with the same job
  and template. Publish a shared pending promise before asynchronous credit
  work. Success commits once; failure refunds once, removes the failed cache
  entry and permits a deliberate later retry. Each caller must still pass
  ownership and account checks, including a cached Premium result. This shares
  the existing in-process cache; it is not a distributed cross-replica lock.
- Delivery confirmation could deadlock against cancellation. Confirmation held
  the job while inserting a USD unlock with a wallet foreign key; cancellation
  held the wallet while waiting for that job. Both now lock wallet before job.
  A controlled race on real disposable PostgreSQL16 reproduced `40P01` before
  the fix and completes without deadlock after it, with exactly one delivery,
  one debit and no cancellation refund after delivery.
- The retained proportion-correction API checked red-channel statistics instead
  of alpha because Sharp `stats()` reads the original input before
  `extractChannel()`. It rejected a valid transparent white portrait and
  accepted opaque/empty mattes. Inspect the actual alpha channel. This does not
  add a correction request or activate that legacy API for current v9 creation.
- A cached Premium outfit could bypass the account check made only when creating
  the cache entry. Verify the caller before consulting the cache; an unsigned
  request cannot retrieve it by presenting the same wallet/job identifiers.
- Opening authentication from the member popover removed its focused menu item.
  Closing the native dialog then left keyboard focus on the body. Focus the
  persistent member button before opening the dialog; native modal restoration
  returns there, while nested dialogs retain their existing focus behavior.

## Validation

`node --test tests/*.test.js` passes105 current Node regressions, including real production
route bodies with inert gateways. Coverage includes two/one-call AI contracts,
atomic paired failure, native delivery, Thai isolation, all20 imported garment
alpha planes, fixed PNG aspect, signatures, USD prices, authentication,
ownership, photo expiry, retry keys and rejected checkout destinations.

`check-payment-storage.mjs` passes15 isolated PGlite SQL scenarios: all frozen grants,
rollback, idempotent delivery, migrations, exact refund columns,20-credit USD
exhaustion, expired credits and old-cycle refunds. `check-payment-settlement.mjs`
passes19 local HTTP/Stripe fixture scenarios for callback/poll replay and ownership/amount
checks. `check-ai-delivery-concurrency.mjs` uses real PostgreSQL16 in a temporary
loopback-only Docker container and removes it afterward.

Browser validation uses Chromium at desktop/mobile sizes with mock API,
account and payment boundaries. It covers explicit English creation and PNG
selection, both-language PNG/PDF adjustment and Letter/A4 output, finish
switching, content guards before export/credit, native account dialogs,
marked preview before packages, crop/draft recovery, repeated downloads,
asset loading and viewport stability (16 normal cases plus one failed-load/retry case). Test fixtures were aligned with the
current default-English locale, member menu, outfit catalogue, accessibility
roles and PNG/PDF labels; product UI was not reverted to satisfy old selectors.

No paid provider generation, live charge, email or customer-database mutation
was performed by these tests. They verify behavior and failure handling, not
new photographic rendering quality.

## Historical tooling limits

Several older standalone `check-*.mjs` scripts still compile fragments of the
monolithic App with fixture globals from earlier releases. The audit recorded
those failures rather than treating missing fixture identifiers as runtime
bugs or weakening their assertions. In particular: staged-job binding,
classic processing preflight, old checkout-continuity/recovery, owner feature
fixtures, second-upload and classic hair-transaction fixtures need a separate
migration to the current App harness. The old source-download database script
also requires its explicitly configured disposable PostgreSQL target.
They are not represented as passing tests. Current Node, browser and isolated
payment/concurrency coverage above is reported separately.
