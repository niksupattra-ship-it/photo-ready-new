# Photo downloads

Thai and English receipts and standalone Studio use the same compact photo/PDF
controls, localized with their respective photo-size presets.
The authorized frozen source is used; PDF creation does not call AI or consume
another download credit. Existing output/account checks still precede delivery.
Paid automatic delivery remains the original image, exactly once.

PNG supports original resolution and the international photo presets. PDF
requires a physical preset: 35×45 mm, exact 2×2 inches (50.8×50.8 mm), 33×48 mm,
or 50×70 mm. The default fills one Letter page; the user can reduce the copies.
Thai printing retains all existing Thai photo dimensions. The page is exactly 612×792 PDF points (8.5×11 inches), with 18-point margins
and 9-point gaps. Photo dimensions convert millimetres to points using 72/25.4,
independently of screen DPI. One cropped JPEG is embedded and reused for copies.
Print at Actual size / 100%; printer fit-to-page settings can change physical size.

PDFs are built locally; the image archive continues to store photo files rather
than treating a PDF as an image. Mobile uses a fresh Save PDF/Share gesture.

Checks: `node --test tests/letter-photo-pdf.test.js` validates layout, parses the
PDF with pdfinfo and rasterizes it with pdftoppm. With Vite on port 5193,
`python tests/english-download.browser.py` exercises the real receipt component,
PDF and PNG downloads, mobile saving, short viewports and Thai isolation using
local fixtures with no account/payment/provider calls.

PNG framing is interactive immediately, including original-resolution exports.
Mouse/touch dragging works at 100% without first zooming, with a visible 50–300%
zoom slider, touch pinch and Reset. Framing beyond the image keeps its existing
background colour. The freePosition flag is preserved into PNG cropping and
archive preparation, so downloaded pixels match the preview. PDF uses the same
framing and exact physical photo dimensions. Legacy crop components keep their
existing bounded behavior unless this explicit flag is present.
