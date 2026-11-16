# Anticipate the next Easy Mode menu

After a photo has been selected, Easy Mode prepares the first eight hairstyle
thumbnails and category cover thumbnails while the user chooses options. When
the pointer or keyboard focus indicates an outfit category, it prepares that
category's first eight thumbnails. Visible menu images continue to load through
their normal higher-priority path.

Only content-hashed public picker URLs are allowed. Prefetching runs at low
priority, with two concurrent downloads, a maximum of twelve candidates per
plan and sixteen retained decoded thumbnails. Leaving a step cancels queued
work; current photo processing and the browser's Save-Data setting disable new
warming. The landing page, native assets, customer images, selection callbacks,
payment checks and exported image pixels are unchanged.

## Validation

- Four scheduler tests cover concurrency, cancellation, source restrictions,
  deduplication, failure/retry and bounded retention.
- Picker/hair/loader regression group: 17 tests pass.
- Real EasyMode menus pass at 390px/1440px for male/female, including missing
  thumbnail recovery and exact original selection callback payloads.
- In local Chromium at 180ms latency and 64KiB/s, with the same 1.8-second
  choice dwell in both cases, the first eight female hairstyle tiles loaded
  after opening in 995ms vs 94ms (390px) and 1435ms vs 83ms (1440px). The
  comparison disables warming with Save-Data for the cold case and uses normal
  warming for the other case. These are local menu measurements with time to
  anticipate the menu, not production or immediate-click guarantees.

```sh
node --test tests/easy-preview-warmup.test.js tests/easy-picker-previews.test.js tests/hair-picker-*.test.js tests/studio-module-loader.test.js
# With Vite running at http://127.0.0.1:5173:
python scripts/check-easy-preview-warmup.browser.py
python scripts/check-easy-picker-previews.browser.py
npm run build
```
