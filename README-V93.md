# V93 Clean Head Master

On the first hairstyle change after locking, `/api/ai-finish` receives `hairId=clean-head` and generates a bald anatomy donor. The client removes its background, aligns it to the immutable locked head, restores originally visible face/neck pixels, validates the donor hair mask, and caches a transparent clean master. Later hairstyle changes send the clean master (not the long-haired original) to the existing hairstyle edit API and composite hair on the clean master. Original hair restore uses zero API calls. Unlocking or uploading another image invalidates the cache.

First change uses two image edits and two background removals; later changes use one of each. Requires real-image API testing; segmentation and generative anatomy are not guaranteed pixel-perfect.
