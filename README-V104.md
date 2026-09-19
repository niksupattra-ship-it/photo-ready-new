# V104 — Original Face Master + Safe Final

- Start from the supplied V103 full project; all existing templates/assets retained.
- Restore central facial pixels from the ORIGINAL photograph, landmark-aligned to the AI head/neck image before first master is committed. Use the existing semantic skin/hair masks and soft perimeter, verify unchanged central core. Fail closed when source face cannot be verified.
- Both AI and diagnostic-import paths already use removeWhiteCutoutHalo (via removeBackgroundBlob for AI). The donor hair is aligned to the locked clean head with alignFaceCanvas.
- Invalidate Final PNG while generating a new hairstyle or first portrait; failed operations cannot enable download of a stale image. Failed edit preview is explicitly labelled old.
- Existing V103 PNG 900x1200 header validation and shared preview/download Blob remain intact.
- Source-photo remove.bg adds ONE background removal request to first portrait processing (no additional AI image edit); it may incur remove.bg credits. No image-quality or visual match guarantee without browser/API testing.
