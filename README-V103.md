# V103 — Final PNG delivery guard

- Base: V102. Changes only `src/main.jsx`.
- Canonical final renderer produces PNG 900 × 1200 (full existing template canvas resampled once).
- PNG signature, IHDR and dimensions checked before preview is published.
- Download disabled while a render is pending or no validated PNG exists.
- Download uses the exact Blob currently shown in preview; no on-click rerender.
- Existing AI hair pipeline is unchanged; no claim of verified hairstyle fidelity or seam quality.
