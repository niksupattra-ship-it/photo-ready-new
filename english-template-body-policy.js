export const ENGLISH_TEMPLATE_BODY_FINISH_VERSION='en-body-proportion-lock-v8';
export const ENGLISH_TEMPLATE_BODY_FRAMING_VERSION='outfit-complete-frame-v16-proportion-lock';
export const isEnglishTemplateBodyFinish=version=>[ENGLISH_TEMPLATE_BODY_FINISH_VERSION,'en-outfit-proportional-head-v7','en-fixed-face-scale-pair-v6','en-identity-layout-pair-v5','en-complete-ai-pair-v4','en-template-locked-body-v3'].includes(version);
// The current Flash model caps native output at 4,624,220 pixels. Keep an exact
// 3:4 frame with 32-pixel dimensions below that cap; do not retry an invalid size.
export const ENGLISH_TEMPLATE_BODY_SIZE='1824x2432';
export const isEnglishTemplateBody=fields=>fields?.interfaceLanguage==='en'&&fields.portraitComposition==='en-outfit-body-v1'&&isEnglishTemplateBodyFinish(fields.englishStudioFinishVersion);

export const usesEnglishIdentityLayout=fields=>fields?.interfaceLanguage==='en'&&fields.portraitComposition==='en-outfit-body-v1'&&[ENGLISH_TEMPLATE_BODY_FINISH_VERSION,'en-outfit-proportional-head-v7','en-fixed-face-scale-pair-v6'].includes(fields.englishStudioFinishVersion);
