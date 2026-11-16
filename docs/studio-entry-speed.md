# Open Studio without the blank starting page

Direct Studio entry previously changed the route before loading a native outfit,
scanning its alpha and collar socket, encoding background/outfit canvases as PNG,
and downloading the editor chunk. During that work the app displayed a plain
"opening Studio" paragraph and Home button on an otherwise empty page.

The Home/upload interface now remains mounted while the starter project and
editor module prepare in parallel. The Studio button shows its opening state
in place. Pointer/focus intent starts the shared editor download early. The
standalone `studio-starting` return has been removed. Failed opens remain on
Home with retry, preserving any uploaded source and the intended entry mode.
Purchased-photo opening retains its existing original-photo preview flow.

Native outfit alpha/socket metrics are derived during the production build,
bound to the original asset hash, and bundled for all 75 catalog outfits. Entry
fetches the existing 512px garment preview and original background bytes, with
no browser-side native outfit download, alpha scan or full-frame PNG encoding.
Unknown template/background combinations retain the original fallback.

The temporary outfit is marked `suitPreviewOnly` with its original template
identity and placement. The existing native-upgrade mechanism still replaces
preview pixels before export and pixel-detail operations. Saved/purchased
projects and completed customer portraits do not use this starter path.

## Validation

- Production build and its existing portrait gates pass.
- Starter, loader, purchased-work and preparation tests: 53 pass.
- Actual save/open handler checks: 32 pass. Existing suit guards: 4 pass;
  Studio snapshot checks: 7 pass.
- Built-app direct-entry checks at 390px/1440px, including delayed assets and
  failed/retried editor downloads: Home stays visible while preparing, the
  editor canvas paints, no blank starting page or native outfit requests occur,
  and no page errors occur.
- Built-app upload/retry checks retain the original photo on both viewports.
  Existing Easy Mode wizard checks still show all five backgrounds and small
  category thumbnails without page errors.
- Eight native-browser placement comparisons (four outfit families, two
  backgrounds) match width/height and differ by at most 0.063 native-frame
  pixels in vertical placement; other measured coordinates match. The
  compatibility check allows less than 0.1 pixel, accounting for readback
  differences at the alpha threshold. Original asset hashes match all 75 files.

No production customer photo, AI generation or payment was used in these checks.

```sh
npm run build
node --test tests/studio-starter.test.js tests/studio-module-loader.test.js tests/purchased-*.test.js tests/saved-project-preparation-speed.test.js
python scripts/check-studio-entry.browser.py
python scripts/check-studio-loading.browser.py
# With Vite running at http://127.0.0.1:5173:
python scripts/check-studio-starter-geometry.browser.py
```
