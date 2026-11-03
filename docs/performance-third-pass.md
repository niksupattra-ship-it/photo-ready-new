# Defer the Studio editor JavaScript — 2026-11-03

This pass starts from production commit `5c615341e43261c36b1c078596fad6ccd00d5912`. It defers the existing Studio component until the editor is displayed, including Easy mode. The component receives the same props. Portrait processing, prompts, makeup caches, account/payment APIs, output dimensions and original assets are unchanged.

## Matched build measurements

| Initial assets | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| JavaScript, all initial chunks | 1,369,048 B | 1,115,814 B | 18.5% |
| Initial JS + CSS | 1,875,440 B | 1,622,218 B | 13.5% |
| Initial JS + CSS, Node gzip | 440,756 B | 370,846 B | 15.9% |

The new editor chunk is approximately 255 KB and is fetched only when needed. All initial shared chunks and stylesheets are counted; the smaller main entry alone would overstate the reduction. These are controlled build byte counts, not real-network timings or PageSpeed scores. Public-site/PageSpeed access remains unavailable from the task tools; no production paint-time or INP improvement is claimed.

## Loading and retry behavior

- One loader shares in-flight imports and keeps successful imports. A failed import releases its promise for retry. The loading boundary retains its props and waits up to 30 seconds, then exposes a translated retry action. It does not reload the page or discard the selected file.
- Chromium retains failed native module fetches. Merely clearing a JavaScript promise did not repair this in a browser test. The browser importer uses a fresh query string for subsequent attempts.
- The new project-level `vite.config.js` emits the existing editor as an ES module and exposes its hashed URL through a tiny virtual module. This is source build configuration; managed Environment configuration, secrets, network policy and production runtime configuration are untouched.
- CSS remains eager. `app-styles.js` preserves the original 27-stylesheet order in both entries. The final concatenated CSS rules and their order match the baseline exactly; the unified output only adds Vite's 12-byte marker. This avoids changing the shared homepage/editor cascade when the editor loads later.
- Shared `paintScene` imports for saved-work thumbnails continue to use the actual Studio module.

## Validation

- `npm run build` passes through the existing preview-generation pipeline. Controlled byte measurements use the unchanged source preview map; unrelated generated assets are not committed.
- Unit loader checks cover idle creation, concurrent requests, successful caching and failure attempt numbers.
- Built-browser checks cover no editor request on the homepage, a deliberately failed editor request followed by successful retry, and retained uploaded source images in Thai and English. Every API is fulfilled locally; external requests are blocked.
- Built English/Thai interface checks cover homepage portraits, all 36 garment choices, help/terms/account, Studio, photo guide and mobile UI with no uncaught exceptions.
- The real source-upload/PNG-download fixture passes at desktop and mobile widths: 2256×3072 PNGs, one mocked credit per work, no second charge for repeated downloads, and paid-work replacement boundaries retained.
- English coverage, startup assets, outfit previews and all 15 actual App makeup/cache scenarios pass. No paid AI, real payment, email or customer account is used.

The first editor opening now requires its deferred network request. This trades some first-open latency for a smaller homepage workload; subsequent openings reuse the module. A tab that spans a deployment which removes its old hashed assets may still require a fresh page load; retry does not fabricate a replacement for a removed build. Revert this pass to restore eager loading.
