# V104 — Hairline blending

- Feather the donor hair alpha silhouette to remove pixelated, rectangular cutout edges.
- Feather the visible original-skin boundary before hair overlap; restore the immutable original facial core at full opacity.
- Preserve the selected hair, current head transforms and uniform template.
- No extra API request or model change.

Note: Visual result requires a live image-edit test; static build checks alone cannot certify photorealism.
