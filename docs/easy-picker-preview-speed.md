# Faster Easy Mode menu images

Easy Mode still used 512px garment previews, original hairstyle previews and
full-size background JPEGs even though Studio already had smaller hair tiles.
It also prefetched two native outfits per category and more on pointer/focus,
competing with menu image downloads.

Easy Mode now uses the existing 192px outfit and hairstyle picker images,
including its selected-step thumbnails. The first twelve outfit tiles load
eagerly, with further tiles lazy-loaded. Category thumbnails load immediately.
Opening/hovering a menu no longer prefetches native outfits. Actual selection
still goes through the existing parent callbacks and image/export pipeline.
Missing picker files fall back to the original display preview once.

All five background menu previews are embedded WebP data URLs, generated from
the existing public background files at build time. They require no additional
network requests when the background tab opens. Selecting a background still
passes its original full-resolution option unchanged.

Outfit thumbnail filenames now include their content hashes, so the existing
immutable public cache policy applies safely across reloads and releases.
Source images, editor/export resolution, AI references and payment rules are
unchanged.

## Measurements and validation

- All 75 outfit picker images: 2,009,098 bytes (512px) to 287,604 bytes
  (192px), an 85.7% reduction for this full catalog.
- Five backgrounds: 122,994 original bytes to 902 encoded WebP bytes, before
  base64/JSON overhead. No background menu HTTP requests are needed.
- Existing hairstyle tiles reduce full-catalog preview bytes by 85.1%.
- Production build and its 48 portrait checks pass.
- Picker, hair, purchased-work and loader tests: 51 pass.
- Existing outfit-choice validation: all 75 Thai/English choices pass.
- Real EasyMode browser checks: male/female at 390px/1440px, with 120ms
  latency and 96KiB/s image throughput. Visible menu images complete, no native
  outfit/512px outfit/original hair/background images are downloaded by the
  menus, selection callbacks retain the exact original catalog entries, and
  no page errors occur. Missing hair thumbnails recover to original previews.

These are asset sizes and local component checks, not production end-to-end
timing guarantees. No customer photo, payment or AI generation was used.

```sh
npm run build
node --test tests/easy-picker-previews.test.js tests/hair-picker-*.test.js tests/purchased-*.test.js tests/studio-module-loader.test.js
node scripts/check-outfit-choice-previews.mjs
# With a Vite dev server at http://127.0.0.1:5173:
python scripts/check-easy-picker-previews.browser.py
```
