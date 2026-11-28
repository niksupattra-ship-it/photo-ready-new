import {registerFemaleLabTransport} from './female-full-lab-transport.js';
import {seedreamProPayload} from './seedream-pro-payload.js';
import {completeGuideEditLabResult} from './female-guide-edit-lab-frame.js';
import {prepareGuideEditIdentity} from './female-guide-edit-identity.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {createGuideEditLabBase} from './female-guide-edit-layout.js';
import multer from 'multer';
import sharp from 'sharp';

// Lab-only candidate. Production keeps its own immutable prompt and cache key.
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
natural photographic skin texture. Use slightly brighter soft frontal
illumination across the face, ears and neck, gently lifting underexposed
skin midtones while preserving the original person's authentic complexion
and undertone. Retain highlight detail, natural contours and fine pores;
do not bleach the skin, clip highlights, erase texture or alter facial anatomy.
Apply subtle rosy cheeks,
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

export async function guideEditLabPayload(options){
 const prompt=typeof options.prompt==='string'?options.prompt.replace(/\r\n/g,'\n'):options.prompt;
 if(prompt!==FEMALE_GUIDE_EDIT_LAB_PROMPT)throw Error('Prompt does not match guide-edit experiment');
 if(options.order!=='person-outfit-hair')throw Error('Invalid reference order');
 const person=options.files?.person?.[0]?.buffer,outfit=options.files?.outfit?.[0]?.buffer,hair=options.files?.hair?.[0]?.buffer;
 if(!person?.length||!outfit?.length||!hair?.length)throw Error('Missing references');
 const reference=async buffer=>{const meta=await sharp(buffer,{limitInputPixels:33554432}).metadata(),mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[meta.format];if(!mime)throw Error('Unsupported reference');return 'data:'+mime+';base64,'+buffer.toString('base64');};
 // Prepare the experimental guide once; never build/discard a production guide.
 const face=await prepareFemaleFace(person,options.fields?.femalePreplacedFace),guide=await createGuideEditLabBase(outfit,face);
 const identity=await prepareGuideEditIdentity(person,options.fields?.femalePreplacedFace);
 const payload=seedreamProPayload(prompt,['data:image/png;base64,'+guide.toString('base64'),await reference(hair),await reference(outfit)]);
 return {...payload,image:[...payload.image,'data:image/png;base64,'+identity.toString('base64')]};
}

export function registerFemaleGuideEditLab(app,{removeBackground,...options}={}){
 const route='/api/female-guide-edit-lab';
 app.get(route+'/prompt',(_req,res)=>res.set('Cache-Control','no-store').type('text').send(FEMALE_GUIDE_EDIT_LAB_PROMPT));
 const guideUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:2,fields:1,parts:3,fieldSize:12000}}).fields([{name:'person',maxCount:1},{name:'outfit',maxCount:1}]);
 app.post(route+'/guide',(req,res)=>guideUpload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  try{
   if(error||!req.files?.person?.[0]||!req.files?.outfit?.[0])throw Error('Missing guide references');
   const face=await prepareFemaleFace(req.files.person[0].buffer,req.body.femalePreplacedFace);
   res.type('png').send(await createGuideEditLabBase(req.files.outfit[0].buffer,face));
  }catch{res.status(400).json({error:'เตรียมไกด์ไม่ได้ กรุณาเลือกรูปคนและชุดใหม่'});}
 }));
 const identityUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:1,parts:2,fieldSize:12000}}).single('person');
 app.post(route+'/identity',(req,res)=>identityUpload(req,res,async error=>{
  res.set('Cache-Control','no-store');
  try{
   if(error||!req.file?.buffer?.length)throw Error('Missing original portrait');
   res.type('png').send(await prepareGuideEditIdentity(req.file.buffer,req.body.femalePreplacedFace));
  }catch{res.status(400).json({error:'เตรียมภาพใบหน้าต้นฉบับไม่ได้ กรุณาเลือกรูปใหม่'});}
 }));
 registerFemaleLabTransport(app,{...options,route,fieldLimit:5,payloadFor:guideEditLabPayload,
  processResult:png=>completeGuideEditLabResult(png,removeBackground)});
}
