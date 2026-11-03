# English interface language audit

The English interface is selected with `?lang=en`. Thai remains the default. The English catalog contains only job application outfits and excludes collar pins, chest pins and ribbon bars.

## Terminology

| Concept | English term |
| --- | --- |
| งาน | project |
| สิทธิ์ดาวน์โหลด | download credits / download access, according to context |
| ชุด | outfit |
| ทรงผม | hairstyle |
| ลายน้ำ | watermark |
| ไม่แต่งหน้า | No makeup |
| แต่งหน้า | Makeup |
| บิดรูป | Liquify |
| หน่วยเงิน | THB |
| ขนาดภาพ | mm, in, px |

Use complete sentences for instructions and errors. Retain payment references, file formats, package amounts and technical codes. Do not substitute a generic success message for an error. Do not claim universal acceptance of an ID photo or a country-specific document standard.

## Coverage

- Source audit of client interface strings and server responses, including dynamic status fragments and accessible labels.
- Main website, guided editor, Studio, account, registration, sign-in, password reset, support, terms, saved projects, package selection, payment instructions, cropping and delivery.
- Mobile save/share dialogs inside shadow DOM, native confirmation messages and the English photo preparation guide.
- English delivery pages and expiration errors, English password-reset emails and language-preserving return links.
- English dates use the Gregorian calendar with explicit Bangkok time where retention dates are displayed. Prices and entitlements are unchanged.
- User-entered values, editable text, uploaded images and saved project data are not translated or modified.

AI processing instructions and the Thai-only delivery template are explicitly excluded from the source language audit. The English delivery renderer is verified independently. The language switch intentionally retains the Thai label for returning to Thai.

## Validation

Run `node scripts/check-english-coverage.mjs`, `node scripts/check-english-preview.mjs`, `node scripts/check-english-services.mjs`, and `node scripts/check-english-dom.mjs`. The Chromium check requires a Chromium executable and permission to launch it. Run `npx vite build` before `node scripts/check-english-interface.mjs` for the built-interface audit. All browser requests are intercepted and service writes are blocked. Service tests mock storage, access checks, network and email delivery. No paid AI, payment, real email or production account is exercised.
