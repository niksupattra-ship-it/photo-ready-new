# Thai female job outfits: four free choices

The first four female job outfits, in requested screenshot order, are navy notch/white shirt, navy double-breasted/cream blouse, navy white collar, and ivory bow blouse. The shared `thai-female-suit-policy.js` defines their exact original catalogue paths and ordering. Every other female garment in `/assets/job-uniforms/` requires the same Pro entitlement as Thai Diamond hairstyles. Government/student/gown outfits, male outfits and the English catalogue retain their existing rules.

Both Studio and Easy Mode order the four free choices first. Paid choices remain visible with a lock/diamond; selecting one opens the existing Pro 159 checkout using the current watermarked editor preview, without selecting the outfit, starting AI, or spending a credit. Existing Pro balance or a work's retained premium right unlocks them like Diamond hairstyles. The package copy includes the added female outfit access.

The server verifies entitlement both before AI reservation and on manual suit authorization. No image assets are changed. Tests cover original-path ordering, free versus paid permissions, free/Pro/English generation, manual suit authorization, actual Studio clicks with/without Pro, and mobile Easy selection with a locked paid choice. Provider/payment callbacks are inert in browser fixtures.

## Male job outfits and restored default

Thai male free choices now start with blue/navy tie, navy three-piece/burgundy tie, white shirt (canonical `male-open-collar-suit.png`), and navy jacket/burgundy shirt (WebP), in screenshot order. Other male job outfits share the Diamond Pro rule, including legacy male garments stored as `female-navy-suit-6/7`. Female free choices retain their four-item order. Checkout copy now describes additional job outfits for both genders.

Restore `seedream-35` (the previously hidden original male style 1) as the first free Thai male hairstyle, followed by 36 and 28. Thai initial generation selects 35 while the default English male helper remains unchanged. A newly generated catalogue thumbnail uses the other male catalogue model's face with the original style-35 haircut. Only preview pixels/mapping change: the original `35.png` and reviewed hair-only AI guide remain intact, documented in the manifest.

Thai Easy Mode no longer renders individual hairstyle names or male/female job outfit captions. Accessible names remain on buttons. Studio already omits these captions; tests verify both desktop and mobile. Additional server tests exercise all four male free garments, paid male rejection and free restored hairstyle 35. Browser coverage includes female free/Pro, Easy Mode, and male Studio at 390/1440px.
