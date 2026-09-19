# V99 — Clean Head visible-hair guard

- Prevent a bald Clean Head from being committed when the selected hairstyle is missing or removed by compositing.
- Validate donor hair coverage on the crown, and check donor hair survives in the final composited PNG.
- Feather the original-face protection mask edges to reduce the oval seam, while preserving immutable core pixels.
- Keep locked head transforms, neck, uniform templates, and rollback behavior unchanged.

Requires a live API image test to verify visual quality; validation errors intentionally preserve the prior image rather than show a bald head.
