# English men's hairstyle set — 14 November 2026

Baseline: `f4f5a0aa61b1119fb44c5019b5adff295d197d23`.
The English men's selector uses seven numbered styles from the supplied ZIPs.
Thai male choices and the 20 English female choices retain their current data.
Existing hairstyle IDs remain available for saved work and older requests.

| Upload number | New ID | Style | Menu image |
| --- | --- | --- | --- |
| 1 | seedream-64 | Soft curly fringe | Example 1 |
| 2 | seedream-65 | Centre-parted curtains | Example 2 |
| 3 | seedream-66 | Wavy centre-parted curtains | Example 3 |
| 4 | seedream-67 | Textured side-swept crop | Example 4 |
| 5 | seedream-68 | Flowing wavy middle part | Transparent reference 5 |
| 6 | seedream-69 | Tousled wavy middle part | Transparent reference 6 |
| 7 | seedream-70 | Straight textured fringe | Transparent reference 7 |

The example ZIP contains numbers 1–4 and duplicate Copy exports. The reference
ZIP contains numbers 4–7 with alternate Copy exports. Entries are matched by
their trailing number. Original non-Copy files are used where available;
reference 4 uses its supplied Copy file. Duplicate exports do not add menu items.

Original source PNG bytes are retained in references 64–70. For styles 1–3 the
full example supplies the source pixels; styles 4–7 use the supplied cutouts.
Local pinned segmentation creates hair-only AI guides, removing donor skin,
ears, face and clothing while retaining source hair RGB. The manifest binds
source, preview and guide hashes. Previews are 400-pixel WebPs; English male
thumbnail framing leaves room above the crown.

Styles 1–4 have matching face landmarks for the existing optional personal
attachment diagram. Styles 5–7 have no face landmarks in their supplied images,
so use the existing scalp-fitting instruction without a synthetic eye diagram.
The shared example-4 landmarks recorded for mask auditing are not generation
placement data. The seven choices retain the existing single male AI call,
fixed outfit/framing, source identity, explicit on-photo Create and cancellation.

Validation: seven catalogue/pipeline tests (including the female catalogue)
cover all bindings, donor-feature removal, language isolation, optional fit
fallbacks, one-call male generation and the female Natural/Makeup pair. Browser
checks cover English/Thai at 390/1440 pixels, all seven new selections, the
unchanged female choices, on-photo controls, cancel/zoom, and mouse, touch and
keyboard creation. Production build verifies 62 picker/guide bindings.
No paid AI or live payment calls are used for these checks.
