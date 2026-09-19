# V102 — Final PNG parity

- Preview and download reuse the exact same final PNG Blob. An outstanding adjustment is flushed before download.
- Stale adjustment renders cannot replace the current hairstyle render.
- Imported AI hairstyle no longer retains a misleading previous numbered hairstyle selection; the status identifies it as imported.
- White-cutout halo cleanup is shared by AI background-removal and diagnostic import paths (already present in V101).
- UI shows final-ready status only when a final PNG Blob has been committed.
- No changes to uniform templates, API endpoints or AI prompts.
- Requires browser/API image tests to verify visual quality; code validation does not prove hairstyle match.
