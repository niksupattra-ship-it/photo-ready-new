# Defer Studio tools until a photo is selected

The home page previously imported the full Studio editor before displaying the
upload screen. The editor is now a separate production chunk. Photo selection
warms one shared import while the photo is prepared; repeated opens reuse it.

The small loading component preserves the parent photo/project state. Failed
downloads offer retry without refreshing the page, and a stalled download has a
30-second deadline. The user can return home while tools are loading. Saved and
purchased project opens download tools alongside project preparation and commit
the new work only when both succeed, with the existing account/cancellation
checks still applied immediately before committing.

## Local production build measurements

Baseline: `ef878ef240737855794463fd0de648937c564e2f`.

| JavaScript | Baseline bytes | Updated bytes |
| --- | ---: | ---: |
| Initial entry | 1,596,425 | 1,291,540 |
| Initial entry, gzip | 430,248 | 344,196 |
| Deferred Studio chunk | 0 | 307,553 |

Initial entry JavaScript falls by 19.1% raw / 20.0% gzip. Total code is split,
not removed; these are build sizes, not production end-to-end latency claims.
The initial entry still exceeds Vite's advisory chunk-size threshold.

## Verification

- Build and its 48 existing portrait regression gates pass.
- Loader, hair picker, purchased work and preparation tests: 55 pass.
- Actual saved-work save/open handler checks: 32 pass, including waiting for
  tools and retaining the active work if the download fails.
- Cancellation lifecycle checks: 5 pass; English daily AI checks: 6 pass.
- Production-browser checks: 390px and 1440px, normal and interrupted network.
  Home makes zero Studio JS requests. Selecting a photo loads the editor;
  retry after interrupted downloads retains that photo. No page errors and no
  AI or payment calls in these fixtures.

```sh
npm run build
node --test tests/studio-module-loader.test.js tests/hair-picker-*.test.js tests/purchased-*.test.js tests/saved-project-preparation-speed.test.js
node scripts/check-saved-work-speed-client.mjs
node scripts/check-portrait-cancellation.mjs
node --test tests/english-ai-outfit-daily.test.js
python scripts/check-studio-loading.browser.py
```

Two older optional browser/integration harnesses were also investigated:
`check-easy-government-outfits.browser.py` assumes the older wizard sequence;
`check-female-finish-integration.mjs` reports eight failures also present when
run against unchanged baseline main.jsx (outdated extraction/stub/assertion
contracts). These are not included in the passing counts above. Live customer,
payment and AI workflows were not exercised.
