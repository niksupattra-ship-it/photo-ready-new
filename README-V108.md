# V108 — fix multipart upload Too many files

Root cause verified in V107 server.js: the global Multer configuration had `files:1` while `/api/ai-finish` uses `upload.fields` with `image` and `mask` for hair-inpaint. The second uploaded file triggers `LIMIT_FILE_COUNT` before any OpenAI call. Changed `files:2`, keeping the route field allowlist at one `image` and one `mask`. Added a guard against masks in non-inpaint requests. This does not modify the number of images sent to OpenAI; image[] remains portrait + hairstyle reference and mask is a separate multipart field.

Local multipart tests are not equivalent to a live OpenAI image generation test. No API key is bundled.
