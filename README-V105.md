# V105 — Source Face & Ear Guard

Based directly on V104.

- Expand source-face protection to temples, jaw, and landmark-based ear regions, intersected with both skin segmentations and excluding donor hair.
- Verify all fully protected facial pixels, not only the central oval; stop before committing the AI master on mismatch.
- Keep the V103/V104 cached Final PNG and download behavior.
- No additional AI or background-removal calls.

Limits: segmentation may still omit parts of ears, and this is not an identity guarantee; browser/image integration must be tested with the user's original photos.
