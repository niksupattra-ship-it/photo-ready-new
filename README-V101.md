# V101 — Change hairstyle after processing

- Select a hairstyle on an already processed portrait without first pressing Lock: the current head/neck/collar transform is captured automatically.
- Subsequent hairstyles use the same immutable master and placement; choosing original hair restores the locked master without an AI call.
- New preview uses the same final compositor as download; prevent earlier editor renders from overwriting the hairstyle and disable download/other hairstyle selections while processing.
- Existing clean-head and face-protection pipeline from V100 is retained. API image generation/background-removal must be tested with valid service credentials in deployment; a local build does not establish image quality.
