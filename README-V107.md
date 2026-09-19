# V107 — Hair inpainting (replaces Clean Head on hairstyle changes)

After a portrait is processed, choosing a new hairstyle starts from the immutable locked head master. The client makes a hair edit mask with MediaPipe hair labels and a face-landmark protected region, sends the original head + mask + chosen hairstyle reference to the existing `/api/ai-finish` endpoint with `mode=hair-inpaint`, removes the returned temporary background, restores the original face pixels with an oval feathered face layer, then renders with the original editor transform/template. A failed request retains the previous preview and never auto-retries.

The legacy Clean Head functions remain for other existing flows, but the post-processing hairstyle switch no longer calls them. This version is NOT API-image tested. Mask fidelity and photographic output require live verification; inpainting is not guaranteed to be pixel-identical outside the composited face.
