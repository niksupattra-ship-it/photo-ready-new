# Pinned browser vision assets

Face Landmarker (float16 v1) and Selfie Multiclass Segmenter (float32 v1)
are redistributed from Google's MediaPipe model storage under Apache-2.0.
`models.json` records the source URLs, byte lengths and SHA-256 digests.

`scripts/prepare-vision-assets.mjs` verifies both models and copies the browser
WASM runtime from the lockfile-pinned `@mediapipe/tasks-vision@1.0.1` package
before development or production builds. Generated `wasm/` files are ignored
by Git and included in Vite's public build output.

The browser loads every vision resource from this versioned, same-origin
directory. No CDN or Google Storage request is needed while processing photos.
