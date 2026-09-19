# V109 — Hair-change original-face pixel validation fix

Based on V108. In the hair-change path, compare RGB only for pixels where the immutable core mask and original source are both fully opaque (alpha 255). Verify the clean base and final composite are fully opaque at those same pixels. Do not treat antialiased alpha 250–254 as exact source-owned pixels. Distinguish hair-change validation errors from initial Master restoration errors. AI calls, background removal, hairstyles, templates, and Final PNG download remain unchanged.

Static tests do not establish visual quality or browser behavior.
