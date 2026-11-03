# First performance pass

This change reduces startup payloads and repeat downloads without changing portrait prompts, model versions, model options, account/credit/payment logic, output dimensions or full-resolution garment assets.

## Controlled local measurements

Measurements use the same built app, viewport and intercepted local browser requests before and after. API writes, AI, payments and email are blocked. These are file-content byte counts, not measured internet transfer times or production Core Web Vitals.

| Measurement | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Initial entry JavaScript | 1,670,658 B | 1,368,992 B | 18.1% |
| Initial entry JavaScript, gzip | 524,234 B | 365,021 B | 30.4% |
| Initial JS + CSS, gzip | 599,906 B | 440,693 B | 26.5% |
| Thai home requested assets, uncompressed | 3,792,885 B | 2,366,411 B | 37.6% |
| English home requested assets, uncompressed | 3,924,730 B | 2,059,804 B | 47.5% |
| Female suit 04 display image | 1,135,240 B | 10,432 B | 99.1% |
| English male hero image | 438,452 B | 11,512 B | 97.4% |

Local first-contentful-paint samples were 352 ms before and 380 ms after. This single pair is subject to browser/process timing variation and is not evidence of a production paint-time improvement. The verified improvement is the smaller initial asset workload. Validate production network timings and Core Web Vitals separately.

## Changes

- The same MediaPipe package is imported on demand. Concurrent portrait operations share the runtime import; failures release the loader for a later attempt. Existing face and segmentation model configuration and lifecycle remain intact.
- The existing Thai guide WebP is extracted byte-for-byte from the JavaScript into a content-addressed public asset. It is requested only when the guide is opened.
- Home display images use a smaller portrait preview. The original photo and garment templates remain untouched. Hero images have explicit dimensions and asynchronous decoding.
- Only hashed JS/CSS and content-addressed public images receive year-long immutable cache headers. HTML revalidates. Unversioned images keep their existing revalidation behavior. Authenticated API responses retain no-store.
- Homepage category cards and popular examples remain portraits. Garment-only choices remain confined to the editing interfaces.

## Validation

- `node scripts/check-startup-loading.mjs`: concurrent imports, failed import retry, model caching, separate category/confidence segmenters, unchanged model paths.
- `node scripts/check-startup-assets.mjs`: preview ratio and size, unchanged guide bytes, initial bundle budget.
- `node scripts/check-public-cache.mjs`: local HTTP integration for cache scope, conditional HTML requests and no-store API responses.
- Existing English coverage, outfit thumbnails, makeup cache and built-interface browser checks.
- `npm run build` completes with the existing build pipeline.

No paid AI call, real payment, real email, production account or environment configuration is used for testing. Undo by reverting this commit; the original source assets remain available.
