// Experimental 5.5 instructions only. Production Pro remains unchanged.
export const FEMALE_55_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. This is a controlled photographic edit, not a new portrait generation.

PRIORITY: Preserve Image 1 facial identity and geometry first, reproduce Image 2 hair second, preserve Image 3 garment details third.

IMAGE 1 — MASTER GUIDE. Preserve its actual photographed face as existing image content. It is the sole authority for identity, age, expression, natural complexion, head size, chin position, neck length, shoulder width, garment placement and framing. Keep the original facial outline, forehead, brows, eyes, eyelids, eye spacing, gaze, nose, lips, jaw, chin, ears and natural asymmetry. Do not reconstruct, idealize, symmetrize, reshape or replace the face. If styling conflicts with identity, preserve identity.

IMAGE 2 — HAIRSTYLE ONLY. STRICT VISUAL COPY. Image 2 is the sole authority for the entire hairstyle. Transfer its actual shape, not a similar hairstyle. Match the parting location, hairline, forehead exposure, strand direction at the roots, crown contour and volume, side silhouette, width beside the face, ear coverage or tuck, texture, colour and visible endpoints. If the reference is straight, flat and center-parted, keep its hair lying close to the head and falling directly downward at the sides; do not sweep it backwards, lift the roots, create a raised crown, or pull it back. Follow the selected reference if it shows another style instead. Remove conflicting original hair; never blend two hairstyles. Empty spaces around and below the hairstyle in Image 2 mean no added hair there. For compact or gathered hair, leave neck sides and the space below the ears free of extra hair. For a bob or long style, reproduce its actual connected lengths and keep the hair behind the garment, not over the collar or insignia. Adapt the hair to the existing face without changing any facial features or head geometry.

IMAGE 3 — GARMENT DETAILS ONLY. Keep the exact collar, fabric, buttons, embroidery and insignia. Image 1 controls garment position and scale. Do not redesign or resize it.

GEOMETRY AND FRAMING. Keep the head, chin, shoulders and collar at their existing coordinates in Image 1. Preserve the original head-to-shoulder ratio and chin-to-collar distance. Complete only missing photographic transitions within the guide. No zoom, crop, camera-angle change, stretch or compression. Keep the original canvas and background.

LIGHTING — PROFESSIONAL STUDIO PHOTOGRAPH. Relight the existing portrait as if photographed with a professional camera and a large neutral-white diffused frontal studio strobe near eye level, supported by soft balanced fill. Produce clean, bright photographic exposure, accurate neutral white balance, crisp optical detail and realistic contrast without changing the camera viewpoint or crop. Lift uneven or dull shadows gently across the face, ears and visible neck with continuous illumination. Preserve the person's original complexion, undertone, natural colour variation, skin texture, facial details and subtle contour shadows. Light the cheeks with neutral reflected light, not added pink, red, peach or coral pigment. Protect highlights from clipping; preserve true garment colours. No skin whitening, beauty filter, artificial glow, oily hotspots, flat mask-like shading or excessive smoothing. The result should look like an actual professionally lit studio photograph, not an illustrated or digitally reconstructed face.

PHOTOGRAPHIC FINISH — PROFESSIONAL ID STUDIO. Preserve the photographed face rather than generating a replacement. Keep the original gaze, eye aperture, eyelid folds, iris and pupil positions, eyebrow shape, lip contour, expression and facial geometry exactly as in Image 1. Keep existing catchlights natural; do not paint new irises, enlarge eyes or alter expression. Simulate the optical clarity of a professional full-frame camera and portrait lens at the existing viewpoint, with accurate focus, natural microcontrast and finely resolved details. Apply restrained photographic retouching only to exposure, white balance, colour casts, sensor noise and processing or compositing artifacts. Use soft fill to reduce harsh lighting-induced creases and shadows without erasing natural skin texture, age characteristics or individual features. Do not invent skin lines or change the facial structure. Preserve the original complexion and natural variation; no added blush, whitening or beauty filter. Keep clean transitions from face to ears and neck, realistic photographic depth, and accurately rendered garment detail. The final result should read as one coherent camera photograph prepared by a professional ID-photo studio.

FINAL CHECK: Same person and geometry as Image 1; exact hair from Image 2, including parting, crown, root direction, side silhouette, volume and visible length, with no conflicting old hair; garment details from Image 3. Return exactly one realistic high-resolution photograph with the same aspect ratio and composition as Image 1.`;

// Use the existing tested guide builder and change only the experiment prompt.
export function female55LabPayloadFrom(buildBaseline,baselinePrompt){
 return async options=>{
  const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
  if(prompt!==FEMALE_55_LAB_PROMPT)throw Error('Prompt does not match current 5.5 experiment');
  const payload=await buildBaseline({...options,prompt:baselinePrompt});
  return {...payload,prompt};
 };
}
