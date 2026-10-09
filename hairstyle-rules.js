// Audited against all 29 female and 12 male picker/cutout pairs.
// Explicit structure complements the image; it never defines facial anatomy.
const descriptions={
 'hair-01':'long loose hair, central part, straight side sections',
 'hair-02':'long loose straight hair, central part',
 'hair-03':'long loose straight hair, central part, gently shaped ends',
 'hair-04':'long hair, braided swept-back crown with loose long back sections',
 'hair-05':'long hair, swept-back crown with loose long back sections',
 'hair-06':'long straight hair, middle part and swept-back upper side sections',
 'hair-07':'long loose hair, side part and diagonal upper sweep',
 'hair-08':'long hair, raised swept-back crown and long back sections',
 'hair-09':'long hair, raised swept-back crown and long back sections',
 'hair-10':'long straight hair, central part',
 'hair-11':'long straight hair, off-centre part',
 'hair-12':'long hair, central part, tucked upper sides and long back sections',
 'hair-13':'long straight hair, off-centre part and smooth upper sweep',
 'hair-14':'long straight hair, central part',
 'hair-15':'long straight hair, side part and smooth diagonal sweep',
 'hair-16':'long straight hair, central part',
 'hair-17':'long straight hair, central part with the reference crown detail',
 'hair-18':'fully gathered/tied-back hair, open forehead, compact crown; no loose long side or back curtains',
 'hair-19':'long loose straight hair, central part',
 'hair-20':'long hair, raised swept-back crown and loose long back sections',
 'hair-21':'fully gathered/tied-back hair, side part and neat upper sweep; no loose long side or back curtains',
 'hair-22':'fully gathered/tied-back hair, side part and smooth upper sweep; no loose long side or back curtains',
 'hair-23':'fully gathered/tied-back hair, deep side part and sleek upper sweep; no loose long side or back curtains',
 'hair-24':'compact short haircut, lifted swept-back crown; no long side or back sections',
 'hair-25':'compact short haircut, side-swept designed fringe; no long side or back sections',
 'hair-26':'fully gathered braided crown updo, central part, sides tucked behind upper ears; NO loose long hair behind or beside either ear, jaw, neck or shoulders',
 'hair-27':'fully gathered/tied-back hair, central part and smoothly tucked sides; no loose long side or back curtains',
 'hair-28':'fully gathered/tied-back hair, side part and smooth upper sweep; no loose long side or back curtains',
 'hair-29':'fully gathered/tied-back hair, off-centre part and the reference short upper fringe; no loose long side or back curtains',
 'manhair-01':'short male haircut, raised swept-back crown and close sides',
 'manhair-02':'short male haircut, neat side part and smooth upper sweep',
 'manhair-03':'short male haircut, textured lifted crown and close sides',
 'manhair-04':'short male haircut with the reference centre-parted wavy curtain fringe',
 'manhair-05':'short male haircut with the reference textured tousled fringe',
 'manhair-06':'short male haircut with the reference off-centre parted upper fringe',
 'manhair-07':'short male haircut with the reference smooth centre-parted curtain fringe',
 'manhair-08':'short male haircut with the reference side-parted upper fringe',
 'manhair-09':'short male haircut with the reference centre-parted wavy curtain fringe',
 'manhair-10':'very short close-cropped male haircut, even rounded hairline',
 'manhair-11':'very short close-cropped male haircut with short textured crown',
 'manhair-12':'short male haircut with raised swept-back crown and close sides',
};
export const HAIRSTYLE_RULES=Object.freeze(descriptions);
export function selectedHairstyleRule(id){
 const description=descriptions[id];
 if(!description)return '';
 const long=id.startsWith('hair-')&&!['hair-18','hair-21','hair-22','hair-23','hair-24','hair-25','hair-26','hair-27','hair-28','hair-29'].includes(id);
 return `SELECTED STYLE ${id} — REQUIRED STRUCTURE: ${description}. The supplied hair image governs its exact parting, fringe, braid/curl details and strand direction. ${long?'Generate ONLY the selected reference long sections; never retain or blend the source hairstyle.':'Remove ALL old long side/back hair from Image 1, including behind both ears and beside the neck. Do not combine this short/gathered style with source long hair. Retain only the intended main fringe or short side sections actually shown in the reference; no invented dangling wisps.'} Adapt HAIR size to the original head, keeping the same selected design. Never change original facial features, existing skin finish or neck anatomy to achieve this style.`;
}
// Used only on the temporary AI upload. Protect the full face and ear region.
export function clearSourceHairTails(pixels,hair,w,h,region){
 const {left,right,earTop,chin}=region;
 if(pixels.length!==w*h*4||hair.length!==w*h||![left,right,earTop,chin].every(Number.isFinite))return 0;
 let count=0;
 for(let y=Math.max(0,Math.ceil(earTop));y<h;y++)for(let x=0;x<w;x++){
  if(y<=chin&&x>=left&&x<=right)continue;
  const n=y*w+x,i=n*4;if(!hair[n]||pixels[i+3]<248)continue;
  pixels[i]=pixels[i+1]=pixels[i+2]=242;count++;
 }
 return count;
}
