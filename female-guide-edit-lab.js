import {productionLabPayload,productionLabPrompt,productionLabResult} from './female-production-lab.js';
import {registerFemaleLabTransport} from './female-full-lab-transport.js';

// Lab-only candidate. Production keeps its own immutable prompt and cache key.
export const FEMALE_GUIDE_EDIT_LAB_PROMPT=`EDIT IMAGE 1 IN PLACE. Preserve its existing composition.

REFERENCE ROLES:
Image 1: The prepared portrait guide. This is the sole authority
for facial identity, facial anatomy, head size, face position,
chin position, neck length, shoulder width and garment placement.

Image 2: Hairstyle reference only. Do not copy its face, head size,
neck, skin, body or clothing.

Image 3: Selected garment detail reference only. Image 1 controls
the garment's final size and position.

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

Preserve the same person's face from Image 1 as closely as possible:
the facial outline, eyes, eyelids, gaze, nose, lips, jaw, expression
and individual asymmetry.

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
Compare the edited portrait directly with Image 1.
The face, head, neck, shoulders and garment must retain the same
scale and placement. Only the selected hairstyle, skin surface
and makeup should visibly change.

Return one edited portrait with the same aspect ratio and framing.`;

export async function guideEditLabPayload(options){
 const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
 if(prompt!==FEMALE_GUIDE_EDIT_LAB_PROMPT)throw Error('Prompt does not match guide-edit experiment');
 // Reuse the exact baseline preparation; only the submitted prompt differs.
 const payload=await productionLabPayload({...options,prompt:productionLabPrompt()});
 return {...payload,prompt};
}

export function registerFemaleGuideEditLab(app,{removeBackground,...options}={}){
 const route='/api/female-guide-edit-lab';
 app.get(route+'/prompt',(_req,res)=>res.set('Cache-Control','no-store').type('text').send(FEMALE_GUIDE_EDIT_LAB_PROMPT));
 registerFemaleLabTransport(app,{...options,route,fieldLimit:5,payloadFor:guideEditLabPayload,
  processResult:(png,{files})=>productionLabResult(png,removeBackground,{outfit:files.outfit[0].buffer})});
}
