# Processing, payment and purchased-work audit

Based on `dd939d7` from main. Existing Thai/English product rules and editable
purchase-history UI are retained. Package prices, frozen historical grants,
English daily quota, USD Premium cycle, suit quantities and retention periods
are not changed.

## Corrections

- Canceling an English daily free AI job now releases only that reservation.
  Previously the generic cancellation branch could add a paid generation
  credit. Existing wallet/job/usage locking and repeated-cancel behavior remain.
- An exact, wallet-owned paid original can recover its work before the premium
  hairstyle gate. Recovery never substitutes a different source, creates a
  payment, consumes another credit or merges unrelated unpaid previews.
- Missing premium hair grants are repaired only from work-specific historical
  payment/archive evidence. Old credit packages priced at 159 are not converted
  into the current hair offer. Existing grants remain authoritative.
- Historical job-keyed suit choices merge into the stable work scope under the
  existing transaction lock. Already selected suits remain reusable; neither
  used slots nor remaining quota reset on reopen.
- Historical archive reconstruction preserves canonical input, and temporary
  storage errors return a retryable error rather than falsely reporting that
  the original is permanently missing.
- Archives without an editable snapshot recover native completed job pixels
  using the real composition functions instead of treating a flattened receipt
  as a separated head. Source-only images retain their aspect ratio. Existing
  manual snapshots stay untouched; cache format 2 excludes older flattened
  cache entries. Female single-finish and legacy paired-finish metadata retain
  their existing semantics.
- The native recovery endpoint requires account authentication, archive
  ownership, unexpired storage and live paid job access before reading source
  or result pixels. A changed account cannot apply the delayed response.

## Verification

Payment signatures and settlement (19), SQL payment storage (15), grouped
PromptPay/Checkout recovery (48), download policy (18), English daily settlement
(10), premium hair/credit access (11), processing preflight (9), explicit
checkout recovery (48) and bounded payment requests (7) passed.

The new purchased archive/context/native restore/prefetch tests plus existing
operation lifecycle, transfer and QR work isolation passed (44). Production
build and its existing portrait regression gates passed (48). Browser checks
covered Thai and English purchase-history edit, retry and download at 390px
and 1440px without runtime errors or overflowing action buttons.

Commands:

```sh
node scripts/check-payment-settlement.mjs
node scripts/check-promptpay-request.mjs
node scripts/check-explicit-checkout-recovery.mjs
node scripts/check-process-credit-preflight.mjs
# Install PGlite separately or set PGLITE_MODULE to its local module path:
node scripts/check-payment-storage.mjs
node scripts/check-grouped-promptpay.mjs
node scripts/check-download-policy.mjs
node scripts/check-english-daily-settlement.mjs
node scripts/check-premium-hair-credit-access.mjs
node --test tests/purchased-*.test.js tests/portrait-operation-lifecycle.test.js tests/portrait-transfer.test.js tests/promptpay-work-recovery.test.js
npm run build
```

All financial and provider tests use isolated fixtures. SQL tests run actual
store queries in disposable PGlite; its single connection does not reproduce
native PostgreSQL multi-process lock scheduling. No production payment, refund,
customer database write or paid AI generation was used to validate the patch.

Historical archives whose verified original was already lost retain their
existing download path; the editor's existing `original_unavailable` response
remains. This patch does not manufacture original proof from a rendered photo,
recreate lost manual edits or retroactively rewrite payment ledgers.
