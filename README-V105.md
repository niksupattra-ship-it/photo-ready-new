# V105 — fix rectangular forehead patch

Review of V104 found that softening the hairstyle alpha alone cannot remove the rectangular AI temporary-background patch retained by the background remover in the clean-head master. Before source-face restoration, intersect the aligned clean-head alpha with an anatomical MediaPipe segmentation mask (hair, body skin and face skin), feathering only its silhouette. Preserve the original face, fixed uniform, editor transforms, and API model/call count. This is a targeted code correction, not a claim of verified live-image photorealism.
