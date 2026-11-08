# Skin and light target

Current new female portraits use the original-upload AI route described in [original-portrait-ai.md](original-portrait-ai.md). The staged workflow below is retained for older pending requests only.

`public/assets/skin-light-reference/studio-soft-frontal-v1.jpg` is an identity-free photographic style guide derived with image generation from the user's visible portrait example (woman in a tan government uniform against blue). It is a generated guide, not an exact crop or a copy of the original uploaded file.

The six swatches show fine skin texture and broad soft-light gradients at several complexion depths. The guide contains no face, eyes, nose, mouth, hair, garment or makeup. Use only its restrained microtexture, smooth tonal transitions and soft satin highlight roll-off. The uploaded person remains the sole source of identity, anatomy, expression and underlying complexion; the swatch RGB values are not a whitening target. Ignore the grid and gutters, and do not enlarge the magnified texture into coarse pores.

Production JPEG: 768×512, 68,941 bytes, SHA256 `a30a50b0a62f3cb350a5662cf4d2420599357f98bf2b5fdb6be5287836644c12`. The full generated source and generation provenance are retained in the task artifacts.

New reference-conditioned requests may adapt face, ear and neck illumination toward a broad soft frontal key and fill, balancing colour casts and excessive directional shadows while preserving gentle three-dimensional shading. Source-image and identity-crop illumination must not override this target. Natural mode uses the skin and light target only; optional lip/eye cosmetics remain a separate final stage.

The v4 live comparison improved directional shadows but left a globally warm, dim version of the same portrait substantially darker than its balanced counterpart. V5 therefore calibrates trustworthy bilateral eye-white illumination cues before skin treatment, and supplies a same-person identity crop consistently. It also repairs untreated skin islands around expanded brow/lip guards before generation. The guide is unchanged; its complexion swatches must not be used to justify retaining an ambient yellow cast or to impose one fixed complexion on different people.

Natural and Makeup use the same processed skin/light base. The existing local makeup palette is the only additional finish; selecting it must not ask the AI to create a second skin interpretation.

Unusable sources need a new photograph when facial detail is lost to severe clipping or insufficient native face resolution. The quality check is conservative and does not guarantee detection of every blurry or unusable photograph.

Visual matching must be assessed from actual provider-generated portraits across usable lighting variations. Unit pixels, synthetic defects, mocked requests and matching deployment hashes establish implementation behavior; they do not alone establish the final visual style.
