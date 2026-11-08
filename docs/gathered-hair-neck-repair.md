# Gathered hairstyle and neck repair

The V5 bounded prompt returned before adding the catalogue's cut-length rules.
It also told every selected style to retain long rear hair. V10 includes the
complete selected hairstyle instruction and applies rear-length wording only
to designs that actually contain long hair. Gathered styles require a complete
replacement of old lower hair, with continuous newly exposed ear/neck skin.

The client neck envelope previously started a narrow, fixed-width shaft
abruptly below the chin. On a retained test result it removed 25,372 valid
upper-neck pixels. A face-relative upper width and continuous rounded flare
preserve those pixels, with zero cuts in the measured neck region. RGB, face
geometry, the deep U backing and lower cutout boundary are unchanged.

Gathered styles now reject substantial lower hair curtains before delivery.
The check uses the existing normalized output evidence, including a conservative
same-image hair/neck colour comparison for dark hair missed by segmentation.
It does not erase strands, paint skin or run another generator. Long hairstyles
retain their intended lengths. V10 cache keys and restored-work version checks
prevent old faulty hair/neck pixels from being reused as repaired output.

Initial generation and hairstyle changes both call `aiFinishPortrait` with the
same untouched original File, selected hair and finish. Natural, Makeup and
the visible Korean Makeup option share preparation, generation, matting,
cleanup and acceptance; only their requested cosmetic finish differs.

Run `node scripts/check-gathered-hair-neck.mjs` for neck, tail, prompt and actual
handler orchestration checks. The continuity and makeup-choice cache suites
also cover old linked hair removal, failed delivery rollback, finish isolation
and invalidation of saved older-policy heads.
