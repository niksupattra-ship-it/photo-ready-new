# Prepared studio skin

New female portraits use `studio-skin-stages-v1`, for both Natural and the supported makeup choices. Existing male requests and requests without this version retain their previous pipeline.

1. Measure face landmarks and semantic skin/hair labels from the exact canonical input. Pack labels to at most 256 pixels on the long edge; MediaPipe can return native-size category masks.
2. Bind the job to the owned work's immutable input. If a saved project or another encoder supplies different canonical bytes, refund the pending reservation and return the frozen input privately. The browser measures that image and retries once within the same submission. The untouched upload remains `originalSource`.
3. Create a separate native-size PNG with bounded shadow fill and broad tone corrections. Only correction fields are smoothed: native skin pixels are not blurred or resized. Protect facial features, dark identifying details, highlights, alpha and non-skin pixels. Estimate global colour casts only when independent near-neutral clothing and background samples agree; preserve natural undertones otherwise.
4. Send that prepared PNG, and an identity crop from the same PNG when requested, to the existing single portrait request. Preserve prepared skin and request conservative photographic detail along with the existing hairstyle, posture and cutout. Defer added cosmetics.
5. After the returned portrait is levelled, Natural finishes directly. Makeup uses detected output landmarks to add restrained lip colour, upper-lid colour and lashes locally. This final stage does not repeat skin brightening, smoothing, contouring or under-eye colouring.

Processed heads carry separate skin and cosmetic completion versions. Old saved pixels remain visible, but cannot seed the new female caches. Explicitly selecting the existing finish can refresh an old result. Never stamp these completion markers on the upload. Existing job confirmation, cancellation, purchase and export transactions remain in place; there is no new automatic job-resume feature.

Validation includes numerical native-pixel invariants, actual multipart/job/SQL handlers with inert services, actual local cosmetic rendering, and real MediaPipe evidence on two existing public application portraits. These checks do not establish that a new provider-generated portrait matches an individual customer's preferred skin style. A blurred source cannot supply genuine lost pores, and generative detail can still differ from the photograph.
