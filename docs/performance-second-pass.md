# Performance audit and second pass — 2026-11-03

## Scope and access limit

The production source head before this pass was `a0a3293a5cd10144649ee1b7672b8c971be7c05b`. The web tool could not access either public language URL or PageSpeed Insights. The managed workspace HTTP policy also excludes these destinations. No environment configuration or network policy was changed. No production PageSpeed score, network latency, field INP or Core Web Vitals result was obtained.

The audit therefore uses actual Chromium with locally fulfilled production-build assets, separate cold contexts for Thai/English at 1440×1000 and 390×844, three runs per combination. The smaller viewport has 4× emulated CPU slowdown; it is not a physical phone or real mobile network. API responses are fixtures, external requests are blocked, and file-body byte counts are uncompressed. Timing samples also share the machine with browser regression tests, so they cannot establish a production speed improvement.

## Findings and changes

1. Four homepage category icons rendered at 28–42 CSS pixels loaded 242,291 bytes of PNGs. New 96-pixel lossless WebP previews total 46,110 bytes, an 81.0% reduction. Their visible RGBA pixels exactly match the resized originals (WebP may discard RGB underneath fully transparent pixels). The original PNGs, portrait examples and full-resolution editing assets remain unchanged. Content-hashed filenames use the existing immutable public-image cache policy.
2. Static Thai guidance initially appeared before the app mounted, then moved. A `#root:empty` viewport-height reservation keeps it below the starting app area. A `noscript` override preserves immediate guidance and its SEO link when JavaScript is disabled. The final mounted layout is unchanged. The local Thai desktop layout-shift sum fell from 0.4272 to 0.0282 across all three runs. Other measured language/viewport combinations stayed at zero. These local initial-page sums are diagnostic observations, not Search Console field CLS.
3. JavaScript (~1.37 MB uncompressed) and CSS (~506 KB) remain the largest initial assets. Splitting editor modules/CSS deserves a separate measured change with upload, export and saved-work regressions; this pass keeps their loading and logic intact.

| Local desktop homepage requested file bodies | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Thai | 2,366,411 B | 2,170,381 B | 8.3% |
| English | 2,084,861 B | 2,032,247 B | 2.5% |

The English audit includes the browser's `/favicon.ico` request, which is why its total differs from the first-pass harness. Compare only the matched before/after runs from this audit. Some short observation windows did not produce an LCP entry; zero entries are missing data, not zero-time paints. No paint-time improvement is claimed.

## Interaction checks

These use local development fixtures with real Studio handlers, and are not production timings:

- Source upload/type selection and actual PNG delivery pass at desktop and mobile widths. PNG files are 2256×3072 pixels. First download spends exactly one mocked credit; repeat downloads spend none; replacing a paid work preserves the warning and requires a separate unlock. Upload/type-selection samples were ~0.79–1.02 seconds; export/download ~1.74–3.93 seconds. The input is a small synthetic image, not a representative camera-photo benchmark.
- Six actual job/student templates were selected at five viewports: 1440×1000, 320×740, 390×844, 820×1180 and 1180×820. All 30 selections, layer application and mobile adjustment undo/redo checks pass. Per-viewport median click-to-ready observations range from ~0.72 to 1.05 seconds and include browser automation overhead.
- The old source-download browser test expected the retired size dialog. It now checks the current receipt screen and actual downloadable link; the underlying credit, PNG and replacement assertions are retained.
- An existing uniform browser test stops on an unrelated mobile tool-icon contrast assertion (observed ~1.39:1). A separate interaction audit records this observation and completes the selection/history checks without treating contrast as passed. No unrelated styling was changed.
- Built-interface regression passes for homepage portraits, all 36 Thai Studio garment selectors, English homepage/help/terms/account/Studio/guide/mobile, and no uncaught runtime errors. English coverage, startup asset/runtime checks, outfit-preview checks and `git diff --check` pass. Guidance remains visible with JavaScript disabled.

Raw local results are under `work/performance-audit/`. Reproduce the built audit after building with `python scripts/audit-built-performance.py`; it requires the existing Playwright/Chromium test environment. Run the source delivery test against local Vite with `SOURCE_DOWNLOAD_BASE=http://127.0.0.1:5192 python tests/source-download.browser.py`.

No AI provider, real payment, customer account or production email is used. Portrait processing, makeup caches, output dimensions, payment/credit APIs and Environment config are unchanged. Revert this pass to restore the prior asset references and mount-area styling.
