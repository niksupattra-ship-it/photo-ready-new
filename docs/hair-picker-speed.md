# Faster hairstyle picker thumbnails

The Studio hair menu used 512px previews for small cards and queued most
visible cards with low fetch priority after an IntersectionObserver callback.
Seedream URLs also include a hair-version query, so exact-path thumbnail
lookups did not cover them.

All 72 catalog preview URLs now have display-only WebP tiles bounded to 192px.
Their total payload decreases from 1,549,501 to 230,804 bytes (85.1%). Images
retain their full composition, aspect ratio and alpha; no hair is cropped out.
The filenames contain the encoded file hash and use the existing immutable
public-image cache policy. The menu starts these small requests immediately
when its selected tab mounts, with normal priority after the first eager cards.

Only the displayed image URL changes. Selected IDs, AI references, native PNG
overlays, editor/export pixels, hair permissions, package rules and existing
preview styling stay unchanged. Unknown sources retain their prior behavior;
a failed thumbnail falls back to its original catalog preview.

Verification:

- Asset/helper tests: 6 passed, including all catalog mappings, query handling,
  aspect/alpha/composition, file hashes, deterministic regeneration and unchanged
  source/overlay/AI-reference hashes.
- Real CatalogPreview browser checks: 8 language/gender/viewport cases plus
  missing-thumbnail fallback passed. Images start without waiting for scroll
  intersection, use no original preview downloads in normal operation and keep
  their original selected IDs. Tests used 120ms latency and 96KiB/s bandwidth
  after fixture startup, with no API, payment or AI generation.
- Public cache checks and production build's 48 existing portrait gates passed.

```sh
node --test tests/hair-picker-assets.test.js tests/hair-picker-preview.test.js
python tests/hair-picker-thumbnails.browser.py
node scripts/check-public-cache.mjs
npm run build
```

Payload reductions and throttled local browser checks are not production
end-to-end timing measurements. An optional older English selected-hair test
still expects the selected-boundary text to be the final prompt suffix; newer
unchanged clean-nape policy appends text after it. The thumbnail change does not
modify that test, production prompts or the image reference pipeline.
