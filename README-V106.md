# V106 — hairstyle hairline continuity

- Removed the hard horizontal `nearCrown` mask cutoff that could leave a straight line across the forehead.
- Uses semantic hair segmentation across the entire donor hairstyle, with a curved, face-relative dark-strand fallback instead of a rectangular cutoff.
- Keeps the existing immutable facial core, current head transform, clothing template, and export flow.
- This is a code correction, not a verified guarantee of photographic realism for every input; API output and segmentation quality still matter.
