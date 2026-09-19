# V111 – Inpainting compositing fix

Based on V110. The actual V110 output showed generated skin/neck edges and a shoulder artifact. The V110 `restoreInpaintFace` drew the entire generated image and then pasted a face-shaped patch, leaving all pixels outside the face mask AI-generated. V111 instead uses the exact inpainting mask for alpha-aware replacement, protects source face/skin/clothing and retains all pixels outside the editable area. It does not use face alignment when the AI output is already the same size. It does not change the OpenAI call count.

Checks: server syntax and ZIP integrity. React build and real OpenAI API image output have NOT been verified; no API credentials available. The visual quality is not certified.
