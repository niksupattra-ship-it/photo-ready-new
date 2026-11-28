// Exact prompt restored from PR #279; browser-safe shared contract.
export const FEMALE_GUIDE_EDIT_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. Preserve its existing composition.

REFERENCE ROLES:
Image 1: The prepared portrait guide. This controls head size, face position,
chin position, neck length, shoulder width and garment placement.
Its face is a small placement preview of the same person in Image 4;
use Image 4 for the original person's facial details.

Image 2: Hairstyle reference only. Do not copy its face, head size,
neck, skin, body or clothing.

Image 3: Selected garment detail reference only. Image 1 controls
the garment's final size and position.

Image 4: The original uploaded person's face, cropped separately at source
detail without a beauty filter or generated reconstruction. This is the
sole facial identity and facial-feature authority. Use its actual facial
outline, eyes, eyelid folds, nose, lips, jaw, expression and asymmetry.
Ignore its original hair, clothes, background and camera framing.
Its close-up crop has NO authority over head size or neck/body placement.
Fit this same face to Image 1's existing scale and position.

ALLOWED EDITS:

1. Replace the hairstyle with the selected design from Image 2.
Match its parting, fringe, texture, colour, length and styling.
Fit the hairstyle around the existing anatomical head without
enlarging the skull or moving the face.

Keep continuing long hair behind both shoulders and behind the
garment. Preserve the genuine endpoints of short, bob and gathered
styles without adding extra lengths.

2. Retouch skin and apply the requested makeup.
Even the skin tone, correct temporary blemishes and retain fine,
natural photographic skin texture. Apply subtle rosy cheeks,
natural glossy pink lips and delicate eyebrow hair strokes.
Match the face, ears and neck continuously.

FACIAL IDENTITY AND GEOMETRY LOCK:

Preserve the same person's face from Image 4:
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
Compare facial features and expression with Image 4, and placement with Image 1.
The face, head, neck, shoulders and garment must retain the same
scale and placement. Only the selected hairstyle, skin surface
and makeup should visibly change.

Return one edited portrait with the same aspect ratio and framing.`;
