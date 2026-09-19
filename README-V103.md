# V103 — AI head-only input and explicit moderation handling

- AI edits now receive a temporary head-and-short-neck input, blanking shoulders and chest below a face-landmark-derived cutoff. Full-quality original and compositing masters are not changed.
- Applies to both clean-head generation and hairstyle donor generation. No silent fallback to a full-body request if landmarks are missing.
- Removes bare-neck/shoulders wording from image-edit prompts.
- Logs moderation code/stage/category/request ID and keeps the existing preview on failure. No automatic retry or safety bypass.
- A moderation output block may still occur; no guarantee of acceptance by the API.
