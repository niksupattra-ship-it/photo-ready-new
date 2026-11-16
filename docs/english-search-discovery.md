# English search discovery

The English entry now describes the actual product in terms of AI professional
headshots, resume/CV photos and job application portraits. Server-rendered and
client-hydrated title/description share one metadata source, avoiding the older
translation runtime overwriting the English search snippet.

The visible English landing explains the workflow, supported international
presets, preview/purchase distinction, and appropriate use of edited portraits.
It links to two standalone, substantive English guides:

- `/en/job-application-photos/`: taking a suitable starting photograph, choosing
  an outfit/background, reviewing AI results and preparing an application image.
- `/en/photo-sizes/`: actual English preset dimensions, matching 300-DPI pixel
  values, cropping, digital submission and print scaling.

The guides are static HTML/CSS with unique headings, titles, descriptions,
canonical URLs, Article/BreadcrumbList data and links back to the editor. They
do not download the React application or depend on JavaScript for their content.
Official-document acceptance is not promised; the guide links to the issuing
authority's instructions where an unedited photograph is required.

Both home languages now have reciprocal `th`/`en` links and an `x-default`
fallback in HTML and sitemap. Existing localized entries remain; both guides
are added to the sitemap. English application metadata uses WebApplication
structured data with real features and no invented ratings or fixed prices.

English root handling precedes static files, preserving `/en` → `/en/` as a
308 redirect with query parameters despite the new public `en` directory.
Unknown English paths return 404 instead of an indexable Thai SPA fallback.
Thai app behavior, photography processing, payments and download rights remain
unchanged.

## Validation

- Six English SEO checks cover language/canonical consistency, runtime metadata,
  sitemap, structured data, guide dimensions and actual HTTP routing.
- Production build and existing portrait gates pass.
- Browser checks: all three English pages have substantive content without
  JavaScript; hydrated English metadata stays consistent at 390px/1440px;
  guides have no horizontal overflow; unknown English pages return 404; the
  Thai landing keeps its original language/canonical.

```sh
node --test tests/english-international-seo.test.js
npm run build
# Against the preview server or the live site after deployment:
ENGLISH_SEO_BASE=https://idpromth.com python scripts/check-english-seo.browser.py
```

Reference: https://developers.google.com/search/docs/specialty/international/localized-versions

This release makes the pages discoverable and crawlable; it does not establish
that Google has indexed or ranked them. No Search Console property is connected
in this task. The owner can submit `https://idpromth.com/sitemap.xml` through
Search Console and inspect the English URLs to monitor crawl/indexing status.
