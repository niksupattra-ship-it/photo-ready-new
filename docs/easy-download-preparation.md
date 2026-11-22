# Easy Mode download opens preparation first

The result-page Download button previously called `allowOutput` before opening the PNG/PDF preparation dialog. Unpaid customers therefore saw a download-credit rejection or purchase modal before they could choose the file format and size.

`receiveSimplePhoto` now awaits the existing nonautomatic `exportImage('image/png')` path directly. It prepares the same current full-resolution composition and opens `EnglishDownload`, retaining PNG/PDF, size, crop and print-copy controls. The existing authorization on confirmation and final export still checks the same job/account, consumes an eligible download credit or opens purchase, and prevents unauthorized file delivery. Awaiting preparation retains the double-click busy guard. No AI request or AI credit is used for preparation.

Verification covers unpaid desktop/mobile preparation and PDF selection before purchase, no unauthorized file, and paid PNG delivery without repeat payment. Provider/payment callbacks are inert in browser fixtures.
