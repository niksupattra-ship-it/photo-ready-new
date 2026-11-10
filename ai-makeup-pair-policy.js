// Browser-safe version shared by requests, cached assets and saved projects.
export const AI_MAKEUP_PAIR_VERSION='ai-makeup-pair-v9-preserve-face-geometry';

// Accept requests already queued or submitted by an older open browser tab.
export const isAiMakeupPairVersion=value=>value===AI_MAKEUP_PAIR_VERSION||value==='ai-makeup-pair-v8-even-fair-rosy-skin'||value==='ai-makeup-pair-v7-brow-gap-fill'||value==='ai-makeup-pair-v6-lifted-blush'||value==='ai-makeup-pair-v5-rose-pink-lips'||value==='ai-makeup-pair-v4-brighter-flash'||value==='ai-makeup-pair-v3-gloss-flash'||value==='ai-makeup-pair-v2-whole-image'||value==='ai-makeup-pair-v1';
