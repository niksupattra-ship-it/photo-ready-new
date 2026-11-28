// Shared guide-only Thai female contract; browser-safe.
export const FEMALE_GUIDE_EDIT_FLASH_POLICY=`
3. Soft frontal studio flash within this same image generation.
Illuminate the face, ears and entire exposed neck together with one broad,
softly diffused flash centred near the camera at eye level, with balanced
fill. Gently lift deficient exposure and unwanted directional shadows on
both sides of the face, beneath the eyes and across the neck. Blend light
continuously through the jaw-to-neck transition, keeping subtle natural
contour shadows and realistic three-dimensional depth. Preserve the
original person's authentic complexion and undertone; change illumination,
not underlying skin colour. Protect already bright skin and specular
highlights from clipping. Retain fine pores, eyebrow hairs and sharp detail;
no whitening, global exposure boost, oily hotspots, flat white skin,
blur, pale patches, dark neck bands or bright compositing seams.
Image 1 supplies facial identity, not mandatory source lighting.
This lighting edit must not move or reshape the face, head, chin, neck,
shoulders or garment and must not alter the selected makeup colours.
`;
export const FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY=`Image 2 is the COMPLETE selected hairstyle, including its empty spaces.
Do not infer a hidden second hairstyle or extend the hair beyond its
visible endpoints. Replace all conflicting hair; do not retain old hair.
ONLY if Image 2 actually shows long connected lengths, reproduce those
lengths behind both shoulders and the garment. For a bob, match its
actual endpoints. If Image 2 shows only a compact crown or gathered
hair with empty space below its tips, all space below both ears and
beside both sides of the neck must be free of hair. No rear curtains,
long side panels, tails, buns at neck level or loose strands. Preserve
the person's ears, face, neck and garment. Use the existing background
outside the person's natural outline, not hair, in these empty spaces.`;
export const FEMALE_GUIDE_EDIT_CHEEK_LIGHT_POLICY=`Even the illumination and retain the person's authentic complexion,
undertone and fine natural photographic skin texture. Do not apply blush,
rouge, pink, red, peach or coral cheek tint, or tinted under-eye makeup.
Preserve the person's natural cheek colour and natural tonal variation.
Use soft neutral studio fill light, not cosmetic pigment, to illuminate
both cheeks. No added colour patches or artificial whitening.
Keep natural glossy pink lips and delicate eyebrow hair strokes.
Match the face, ears and neck continuously.`;
export const FEMALE_GUIDE_EDIT_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. Preserve its existing composition.

REFERENCE ROLES:
Image 1: The prepared portrait guide. This controls head size, face position,
chin position, neck length, shoulder width and garment placement.
Its existing photographed face is the sole facial identity and facial-feature
authority. Preserve the same facial outline, features, expression and
asymmetry already visible in this guide at its existing scale and position.

Image 2: Hairstyle reference only. Do not copy its face, head size,
neck, skin, body or clothing.

Image 3: Selected garment detail reference only. Image 1 controls
the garment's final size and position.

ALLOWED EDITS:

1. Replace the hairstyle with the selected design from Image 2.
Match its parting, fringe, texture, colour, length and styling.
Fit the hairstyle around the existing anatomical head without
enlarging the skull or moving the face.

${FEMALE_GUIDE_EDIT_HAIR_EXTENT_POLICY}

2. Retouch skin and apply the requested makeup.
${FEMALE_GUIDE_EDIT_CHEEK_LIGHT_POLICY}
${FEMALE_GUIDE_EDIT_FLASH_POLICY}
FACIAL IDENTITY AND GEOMETRY LOCK:

Preserve the same person's face already present in Image 1:
the facial outline, eyes, eyelids, gaze, nose, lips, jaw, expression
and individual asymmetry.
Keep the original eye opening, feature spacing, nose width, lip contour,
jaw contour and apparent age. Do not substitute a generic model face,
idealize or symmetrize the features, slim the face or invent a new jaw.

Makeup changes surface colour and finish only.
Do not reshape facial features, enlarge eyes, narrow the jaw,
change the expression or reconstruct the face.

Keep the exact head-to-shoulder ratio and jaw-to-collar distance
shown in Image 1. Keep the chin, collar and shoulders at their
existing coordinates. Complete any missing skin transition only
within that existing space.

Do not resize the head, lengthen or shorten the neck, resize the
garment, move the torso, zoom, crop or change the canvas.

Preserve the garment, insignia and background from Image 1.
Do not change unrelated areas.

FINAL CHECK:
Compare facial features, expression and placement with Image 1.
The face, head, neck, shoulders and garment must retain the same
scale and placement. Only the selected hairstyle, skin surface
and makeup should visibly change.

Return one edited portrait with the same aspect ratio and framing.`;
