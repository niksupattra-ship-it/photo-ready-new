import {femaleFinishFor} from './review-portrait-finish.js';

// Reuse only the accessible cosmetics specification. The legacy head/neck
// cutout task is deliberately excluded from this full-portrait experiment.
export function femaleFullLabPrompt(){
 const makeup=femaleFinishFor('makeup')
  .replace('both ears, head scale and facial proportions','both ears and facial proportions')
  .replace('Keep the original head scale and framing.','Preserve intrinsic head proportions. Use Image 2 for the final garment frame.');
 return `Create exactly one photorealistic female studio ID portrait by combining these three original references in ONE image-generation request.
REFERENCE ASSIGNMENT:
Image 1: The customer's identity and original facial anatomy only. Do not copy its original clothing, hairstyle, camera distance or crop.
Image 2: The selected garment and fixed body template. Preserve shoulder width and slope, collar height and opening, lapels, fabric, seams, tie, buttons, shoulder boards and every existing insignia. Preserve the original garment silhouette and full upper-body area. Do not add, remove, mirror, relocate or redesign insignia.
Image 3: The selected hairstyle only. Follow its hairline, parting, connected lengths, silhouette and texture; never borrow the reference model's face.
COMPOSITION:
Create the face, hairstyle, neck and clothed upper body together as one coherent photograph. Fit the head and naturally compact neck into the existing collar of Image 2. Keep the garment's original proportions; do not stretch or compress either axis. Keep a balanced adult head-to-shoulder ratio and a neutral upright posture. Centre the head over the collar; avoid camera roll and forward head posture while retaining the customer's real facial asymmetry. Do not force mirrored facial features. Show the entire crown and selected hairstyle, both shoulders and the original upper-body garment area. Use a vertical 3:4 frame with a plain white background.
MAKEUP — THE ONLY FEMALE FINISH:
${makeup}
FINAL OUTPUT:
Return the complete clothed portrait as one PNG. Do not return an isolated head or neck, a mask, a collage or separate body parts. Keep fine eyebrow hairs, real pores and individual hair strands sharp without waxy smoothing. Keep the face, ears and neck coherent under soft frontal studio lighting. No added text, accessories or watermark.
`;
}
