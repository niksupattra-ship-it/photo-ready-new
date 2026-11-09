// Current catalogue requests use the actual picker hair, not the legacy cutouts.
// Descriptions distinguish the photographed designs without overriding them.
export const HAIR_REFERENCE_VERSION='picker-hair-v1';
export const PICKER_HAIR_PRIORITY='FINAL PICKER HAIR AUTHORITY: For hairstyle alone, Image 2 overrides generic open-ear, neat-hair, fringe-removal, rear-placement and maximum-length wording. Match its visible parting, fringe, braid/wave texture and endpoints without copying donor anatomy or retaining conflicting source hair.';
const details={
 'seedream-40':'sleek centre-parted compact low gathering, flat crown, open forehead and visible ears',
 'seedream-41':'centre-parted crown braid, interwoven flat braids following both sides of the scalp, clear ears and neck',
 'seedream-42':'sleek long straight black hair, near-centre part, low crown, sides tucked at the ears and complete shoulder-side ends',
 'seedream-43':'long straight dark-brown hair, off-centre side part with a smooth diagonal sweep, tucked ears and tapered shoulder-side ends',
 'seedream-07':'long straight dark-brown hair, near-centre part, fine separated forehead curtain pieces on BOTH sides and flared shoulder-side ends',
 'seedream-14':'long straight centre-parted dark hair with a smooth low crown and the complete shoulder-side ends',
 'seedream-25':'sleek centre-parted long black hair with an open forehead and broad tapered ends',
 'seedream-03':'centre-parted long straight layered hair with smooth inward-curved ends below the shoulders',
 'seedream-05':'smooth centre-parted straight jaw-length bob with its complete blunt rounded ends',
 'seedream-15':'centre-parted half-up hair with swept-back upper sides, fine forehead/temple pieces and long straight rear lengths',
 'seedream-16':'centre-parted braided half-up hair with visible flat scalp braids and long straight rear lengths',
 'seedream-18':'side-swept braided half-up hair with compact upper braid detail and long rear lengths',
 'seedream-20':'low gathered hair with a soft centre part and the delicate face-framing wisps shown beside both cheeks; retain these reference wisps',
 'seedream-26':'swept-back half-up hair with restrained crown volume and long loose rear lengths',
 'seedream-27':'sleek fully gathered centre-parted hair with a compact crown and clear neck',
 'seedream-10':'side-parted rounded jaw-length bob with a broad diagonal forehead sweep and inward-rounded ends',
 'seedream-19':'centre-parted straight shoulder-length lob with complete blunt shoulder-side ends',
 'seedream-01':'short layered shag with centre-parted curtain fringe and the reference cheek/nape layers',
 'seedream-02':'long loose wavy brown hair with fine full forehead bangs and complete broad wavy side lengths',
 'seedream-04':'long straight brown hair with fine full eyebrow-length bangs and complete shoulder-side ends',
 'seedream-06':'long chestnut waves with a centre-parted curtain fringe and complete wavy lengths',
 'seedream-23':'smooth medium-long dark-brown hair with the reference off-centre diagonal forehead sweep and tapered ends',
 'seedream-24':'short layered brown bob with fine wispy forehead bangs and lightly flicked nape ends',
 'seedream-38':'sleek centre-parted long straight black hair with the exact tucked side sections and complete ends',
 'seedream-39':'sleek off-centre dark-brown hair, low crown, visible ears and gently flared shoulder-side ends',
 'seedream-35':'formal swept side part with the exact softly raised front and short sides',
 'seedream-28':'natural short textured side sweep, softly lifted crown and the reference tapered sides',
 'seedream-29':'centre-parted male curtain cut with the deep forehead opening and complete curved fringe',
 'seedream-30':'rounded straight male fringe with its fine centre opening and eyebrow-length front',
 'seedream-31':'wavy centre-parted male cut with the loose curved front locks and textured sides',
 'seedream-32':'short neat side-combed crop with an open forehead and low crown',
 'seedream-33':'smooth short brown side sweep with a low crown and open forehead',
 'seedream-34':'short naturally wavy swept-back cut with the reference textured front and tapered sides',
 'seedream-36':'textured centre-parted male curtain cut with its soft M-shaped opening and naturally layered top',
 'seedream-37':'very short uniform buzz cut with fine scalp stubble, short sides and the natural squared hairline'
};
export function catalogueHairDetail(id){return details[id]||null}
export function catalogueHairInstruction(selected,kind){
 const description=details[selected?.id];if(!description)return '';
 const lengths=kind==='gathered'
  ?`Retain the exact compact gathering and ${selected.id==='seedream-20'?'intentional cheek wisps':'clear neck silhouette'} shown. Remove all old rear curtains and long source lengths absent from this gathered reference.`
  :kind==='long'?'Retain ALL visible long lengths, waves, braids and ends from the picker, including its shoulder-side outline. A crop in the reference is not an instruction to shorten the hair.'
  :'Retain the exact bob, lob, shag or pixie endpoint in the reference relative to the jaw, neck and shoulders. Do not turn it into an updo or extend its ends.';
 return `SELECTED PICKER HAIR ${selected.id}: ${description}. IMAGE 2 is hair extracted directly from the exact picture selected in the menu. It alone controls the parting, hairline design, fringe density/length, curl or wave pattern, braid structure, crown silhouette and visible cut endpoints. Replace ALL conflicting source hair; never average this design with Image 1, the original-identity image or a previous result. Fit this one design to the customer's unchanged skull, face and camera angle. ${lengths} Preserve every intentional forehead piece, side lock, temple wisp and ear covering actually shown in this design; remove only hair absent from it. Expose ears only where the reference exposes them. Never add a bun, tail, curl, fringe or crown height absent from the picker. Do not mirror the selected parting, straighten a wavy design, gather a bob, remove intended bangs or shorten a long cut. Transparent space means no reference hair, not permission to retain source hair. Reconstruct newly exposed ear/neck skin naturally and replace removed exterior hair with background; never erase facial skin or cut rectangular holes. Keep the customer's own face, eyes, ears, jaw and head size. The exact picker design overrides generic neat-hair, open-ear, loose-strand and maximum-length wording.`;
}
