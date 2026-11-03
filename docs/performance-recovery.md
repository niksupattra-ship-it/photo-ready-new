# Restore known-good Studio startup after deployment failure

The optional Studio code-splitting pass (`2780e6b9214e8c6197cbe0f6853593bd3dfca5e8`) deployed on Railway but its Cloudflare Workers build reported failure. The GitHub check supplies only a build URL: no error text or annotations. No Cloudflare integration or credential is available in this workspace, and the task prohibits Environment configuration changes. The underlying Cloudflare error is therefore unconfirmed; this recovery does not claim to diagnose it.

To restore the last deployment that succeeded on both providers, this change withdraws only the Studio code-splitting pass. `src/main.jsx` and `src/studio-editor.jsx` are restored to the exact Git blobs from `5c615341e43261c36b1c078596fad6ccd00d5912`:

- `src/main.jsx`: `255735814faef0a017e0db09f673aae3d90a0c84`
- `src/studio-editor.jsx`: `8b69dac127d6b35b0c332866c661314f031a2579`

The new Vite configuration, virtual importer, deferred wrapper, shared stylesheet aggregator and their dedicated tests/report are removed. Studio again loads with the application, so the additional 18.5% initial-JavaScript reduction from that experimental pass is withdrawn. The prior MediaPipe deferral, external guide asset, smaller display images/category icons, public-file cache policy and homepage layout reservation remain intact.

No portrait pipeline, makeup prompt/cache policy, account, credit, payment, original output dimensions, garment template, environment variable or managed Environment configuration is changed. Homepage examples still show people; garment-only previews stay in editing selectors. No customer records, real email, paid AI or real payment is used for verification.

Verification covers the existing default build, exact restored source hashes, English coverage, startup assets/runtime, English preview, all 36 outfit choices, all 15 App makeup/cache scenarios, the built-browser interface and actual PNG delivery with mocked rights at desktop/mobile sizes. Deployment status must be verified separately for this recovery commit; a local passing build is not a claim of successful Cloudflare publication.
