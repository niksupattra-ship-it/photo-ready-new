// Browser-safe version shared by requests, cached assets and saved projects.
export const AI_MAKEUP_PAIR_VERSION='ai-makeup-pair-v3-gloss-flash';

// Accept requests already queued or submitted by an older open browser tab.
export const isAiMakeupPairVersion=value=>value===AI_MAKEUP_PAIR_VERSION||value==='ai-makeup-pair-v2-whole-image'||value==='ai-makeup-pair-v1';
