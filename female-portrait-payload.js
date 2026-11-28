import sharp from 'sharp';
import {createFemaleLabBase} from './female-portrait-layout.js';
import {prepareFemaleFace} from './female-preplaced-face.js';
import {prepareGuideEditIdentity} from './female-guide-edit-identity.js';
import {seedreamProPayload} from './seedream-pro-payload.js';

// PR #279: guide, selected hair, garment, independent original-face detail.
export async function currentFemalePortraitPayload(options){
 if(options.order!=='person-outfit-hair')throw Error('Invalid reference order');
 const person=options.files?.person?.[0]?.buffer,outfit=options.files?.outfit?.[0]?.buffer,hair=options.files?.hair?.[0]?.buffer;
 if(!person?.length||!outfit?.length||!hair?.length)throw Error('Missing references');
 const reference=async buffer=>{const meta=await sharp(buffer,{limitInputPixels:33554432}).metadata(),mime={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'}[meta.format];if(!mime)throw Error('Unsupported reference');return 'data:'+mime+';base64,'+buffer.toString('base64');};
 const face=options.files?.face?.[0]?.buffer||await prepareFemaleFace(person,options.fields?.femalePreplacedFace);
 const guide=await createFemaleLabBase(outfit,face),identity=await prepareGuideEditIdentity(person,options.fields?.femalePreplacedFace);
 const payload=seedreamProPayload(options.prompt,['data:image/png;base64,'+guide.toString('base64'),await reference(hair),await reference(outfit)]);
 return {...payload,image:[...payload.image,'data:image/png;base64,'+identity.toString('base64')]};
}
