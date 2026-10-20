// One final male-only grooming rule, applied AFTER initial/selected-hair branches.
// It changes facial-hair appearance only, never anatomy or the processing route.
export const MALE_SHAVE_POLICY=`MALE FINAL GROOMING REQUIREMENT — BOTH ORIGINAL AND SELECTED HAIRSTYLES:
Image 1 determines the person's identity and facial anatomy. Facial hair is removable grooming, not identity anatomy. Any image of the selected haircut supplies scalp hair ONLY; never copy its moustache, beard, stubble, skin or face.
Create a naturally freshly shaved upper lip, mouth corners, cheeks, chin, jaw and visible neck. Remove visible black, brown, grey and white hair shafts, sparse whiskers, short stubble and beard clusters. Locally replace the removed hairs with adjacent healthy skin texture under the EXISTING complexion and illumination. Neutralize broad grey/blue/brown beard or moustache pigmentation so it does not remain as a dark beard-shaped patch.
Keep fine real pores and natural skin grain. A follicle may remain as subtle skin texture at close inspection, but not as an obvious dark dot, moustache line, goatee, beard strip or five-o-clock shadow. No waxy, blurred, uniformly painted or unnaturally poreless skin.
Do not erase true moles, beauty marks, freckles or scars. Preserve lip contour, the dark mouth opening, nostrils, jaw/chin shape, natural folds and anatomical shadows; do not confuse these with beard pigmentation. Keep eyebrows, eyelashes, the selected scalp haircut and its sideburns unchanged.
Check upper lip AND chin/jaw/neck before completing: no surviving visible facial hair or beard-shaped colour patch. This is a local grooming exception to source-detail retention, not permission to reshape or whiten the face. Keep all other accepted skin/light/lip/hair/ear/neck/shoulder/cutout instructions unchanged. Perform it within this SAME generation; no extra AI pass or pasted face.`;
export function applyMaleShavePolicy(prompt,gender){
 return gender==='male'?prompt+'\n'+MALE_SHAVE_POLICY:prompt;
}
