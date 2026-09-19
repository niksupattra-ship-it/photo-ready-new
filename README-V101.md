# V101 — Diagnostic reuse and cutout halo fix

- Removes connected near-white cutout fringe from transparent AI results before semantic segmentation.
- Adds offline import of two diagnostic PNG files (Clean Head first, Selected Hair AI second), re-composites without AI API calls.
- Does not change uniform templates, lock transforms, or export renderer.
- Important: importing requires an active locked original in the current browser session.
- This is a code-level change, not a claim of guaranteed photo-quality results.
