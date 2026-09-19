# V102 — Hair selection after processing

- Fix donor-hair extraction: use dark donor strands plus MediaPipe segmentation, not the 256px hair category alone; filter bright/white cutout halo.
- Keep the original immutable facial core and previously adjusted head/neck/template placement.
- Composite the new hairstyle into the final preview before marking the selection successful; the download uses the same updated master.
- Remove intermediate Clean Head and AI donor PNG download buttons from the main editor (internal diagnostic functions retained).
- If no usable new hair is found, keep the original preview rather than displaying a bald head.

Requires an actual deployed AI API to test end-to-end hairstyle quality; JSX syntax checked locally.
