// Experimental 5.5 instructions only. Production Pro remains unchanged.
export const FEMALE_55_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. This is a controlled photographic edit, not a new portrait generation.

PRIORITY: Preserve Image 1 facial identity and geometry first, reproduce Image 2 hair second, preserve the garment details already present in Image 1 third.

IMAGE 1 — MASTER GUIDE. Preserve its actual photographed face as existing image content. It is the sole authority for identity, age, expression, natural complexion, head size, chin position, neck length, shoulder width, garment placement and framing. Keep the original facial outline, forehead, brows, eyes, eyelids, eye spacing, gaze, nose, lips, jaw, chin, ears and natural asymmetry. Do not reconstruct, idealize, symmetrize, reshape or replace the face. If styling conflicts with identity, preserve identity.

IMAGE 2 — HAIRSTYLE ONLY. STRICT VISUAL COPY. Image 2 is the sole authority for the entire hairstyle. Transfer its actual shape, not a similar hairstyle. Match the parting location, hairline, forehead exposure, strand direction at the roots, crown contour and volume, side silhouette, width beside the face, ear coverage or tuck, texture, colour and visible endpoints. If the reference is straight, flat and center-parted, keep its hair lying close to the head and falling directly downward at the sides; do not sweep it backwards, lift the roots, create a raised crown, or pull it back. Follow the selected reference if it shows another style instead. Remove conflicting original hair; never blend two hairstyles. Empty spaces around and below the hairstyle in Image 2 mean no added hair there. For compact or gathered hair, leave neck sides and the space below the ears free of extra hair. For a bob or long style, reproduce its actual connected lengths and keep the hair behind the garment, not over the collar or insignia. Adapt the hair to the existing face without changing any facial features or head geometry.

GARMENT — ALREADY IN IMAGE 1. Keep the exact collar, fabric, buttons, embroidery and insignia of Image 1. Image 1 controls garment position and scale. Do not redesign or resize it.

GEOMETRY AND FRAMING. Keep the head, chin, shoulders and collar at their existing coordinates in Image 1. Preserve the original head-to-shoulder ratio and chin-to-collar distance. Complete only missing photographic transitions within the guide. No zoom, crop, camera-angle change, stretch or compression. Keep the original canvas and background.

LIGHTING — PROFESSIONAL STUDIO PHOTOGRAPH. Relight the existing portrait as if photographed with a professional camera and a large neutral-white diffused frontal studio strobe near eye level, supported by soft balanced fill. Produce clean, bright photographic exposure, accurate neutral white balance, crisp optical detail and realistic contrast without changing the camera viewpoint or crop. Lift uneven or dull shadows gently across the face, ears and visible neck with continuous illumination. Apply local photographic exposure and white-balance correction to the existing skin only; soften harsh lighting-induced shadows without changing natural skin colour, texture, facial features or geometry. Do not change the framing, camera viewpoint, hair or garment as part of this skin-light correction. For localized dark or discoloured spots caused by uneven illumination, colour casts or image-processing artifacts, use restrained spot-level tonal correction rather than global smoothing. Preserve genuine freckles, moles, permanent identifying marks, natural pigmentation, pores and fine texture. Do not alter any facial features, hair, garment, proportions or framing. Preserve the person's original complexion, undertone, natural colour variation, skin texture, facial details and subtle contour shadows. Light the cheeks with neutral reflected light, not added pink, red, peach or coral pigment. Protect highlights from clipping; preserve true garment colours. No skin whitening, beauty filter, artificial glow, oily hotspots, flat mask-like shading or excessive smoothing. The result should look like an actual professionally lit studio photograph, not an illustrated or digitally reconstructed face.

FINAL CHECK: Same person and geometry as Image 1; exact hair from Image 2, including parting, crown, root direction, side silhouette, volume and visible length, with no conflicting old hair; garment details already in Image 1. Return exactly one realistic high-resolution photograph with the same aspect ratio and composition as Image 1.`;

// Preserve the existing guide builder; send only guide and hair in the 5.5 experiment.
export function female55LabPayloadFrom(buildBaseline,baselinePrompt){
 return async options=>{
  const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
  if(prompt!==FEMALE_55_LAB_PROMPT)throw Error('Prompt does not match current 5.5 experiment');
  const payload=await buildBaseline({...options,prompt:baselinePrompt});
  if(!Array.isArray(payload.image)||payload.image.length!==3)throw Error('Expected existing guide, hair and garment builder');
  return {...payload,prompt,image:payload.image.slice(0,2)};
 };
}
