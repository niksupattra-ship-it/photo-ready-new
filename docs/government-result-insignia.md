# Government insignia on the finished Thai photo

The finished-photo picker places collar pins, the chest badge and ribbons onto the existing native editor layers. It does not create an AI job or change the customer's selected rank. Studio's normal placement controls, reference preset, artwork, source aspect ratios and export pipeline remain unchanged.

## Correct garment measurements

The earlier shoulder scan accepted a narrow white collar as the first stable shoulder span. On the catalogue example photos, that reduced a roughly 800-pixel shoulder span to about 300 pixels in the 900×1200 workspace. As a result, insignia were too small and placed too high and close together.

The finished-photo fit now measures a stable broad garment band and locates its shoulder height separately. Male standing collars use their own close-set collar and chest reference ratios; female lapels retain the approved wider pair. Sizes follow the measured shoulder span rather than the whole canvas or lower jacket width. Unsupported or ambiguous photographs retain an editable fallback and a placement-review indication.

## Preserve the current photo and manual corrections

The measurement cache follows the actual painted garment, its geometry and its exact pixel sources. Moving/scaling a completed body photo, rotating a native garment or editing its pixels cannot reuse an earlier fit. Adding or changing a badge does not itself alter the garment measurement.

When the customer drags or resizes an insignia, its next replacement uses the same manual placement in both the temporary preview and committed native layer. Collar pins keep independent left/right offsets and sizes. The preservation option is enabled only by the finished-photo picker; Studio preview defaults are unchanged.

## Verification

Regression tests cover the real male/female catalogue photographs, different portrait sizes, narrow-collar false positives, unsupported backgrounds, cache invalidation and manual placement. A browser fixture uses the real editor and native garment/insignia assets on desktop and mobile, with inert account/payment/AI callbacks. These checks verify placement and persistence; they do not perform a customer purchase or image-generation request.
