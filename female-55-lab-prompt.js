// Experimental 5.5 instructions only. Production Pro remains unchanged.
export const FEMALE_55_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. This is a controlled photographic edit, not a new portrait generation.

PRIORITY: Preserve Image 1 facial identity and geometry first, reproduce Image 2 hair second, preserve Image 3 garment details third.

IMAGE 1 — MASTER GUIDE. Preserve its actual photographed face as existing image content. It is the sole authority for identity, age, expression, natural complexion, head size, chin position, neck length, shoulder width, garment placement and framing. Keep the original facial outline, forehead, brows, eyes, eyelids, eye spacing, gaze, nose, lips, jaw, chin, ears and natural asymmetry. Do not reconstruct, idealize, symmetrize, reshape or replace the face. If styling conflicts with identity, preserve identity.

IMAGE 2 — HAIRSTYLE ONLY. Copy the complete selected hairstyle, not a similar interpretation. Match its part, hairline, fringe, colour, texture, silhouette and actual endpoints. Ignore any donor facial features, skin or clothing. Replace all conflicting original hair. Blank space outside the selected hair silhouette is evidence of absent hair, not an invitation to invent lengths. For a compact or gathered cut, leave both neck sides and the space beneath the ears free of hair; no rear curtains, hanging panels or neck-level buns. For a bob or long cut, preserve only its actual connected lengths. Keep long hair behind the garment and never across the collar or insignia. Fit the hair without altering the head or face.

IMAGE 3 — GARMENT DETAILS ONLY. Keep the exact collar, fabric, buttons, embroidery and insignia. Image 1 controls garment position and scale. Do not redesign or resize it.

GEOMETRY AND FRAMING. Keep the head, chin, shoulders and collar at their existing coordinates in Image 1. Preserve the original head-to-shoulder ratio and chin-to-collar distance. Complete only missing photographic transitions within the guide. No zoom, crop, camera-angle change, stretch or compression. Keep the original canvas and background.

LIGHTING. Use clean, neutral, softly diffused frontal studio flash and balanced fill to correct uneven illumination across face, ears and visible neck. Preserve natural complexion, skin texture, fine detail and realistic contour shadows. No skin whitening, added blush, artificial colour patches or beauty filter. Protect highlights and preserve garment colours.

FINAL CHECK: Same person and geometry as Image 1; exact hair from Image 2 with no conflicting old hair; garment details from Image 3. Return exactly one realistic high-resolution photograph with the same aspect ratio and composition as Image 1.`;

// Use the existing tested guide builder and change only the experiment prompt.
export function female55LabPayloadFrom(buildBaseline,baselinePrompt){
 return async options=>{
  const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
  if(prompt!==FEMALE_55_LAB_PROMPT)throw Error('Prompt does not match current 5.5 experiment');
  const payload=await buildBaseline({...options,prompt:baselinePrompt});
  return {...payload,prompt};
 };
}
