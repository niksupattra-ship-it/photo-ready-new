import {FEMALE_SINGLE_FINISH_VERSION} from './female-single-finish-policy.js';

// Opt-in for new jobs only; already queued and purchased portraits retain their
// original generation contract and cached pixels.
export const SINGLE_PASS_PORTRAIT_VERSION='single-pass-portrait-v1';
export const isSinglePassPortrait=fields=>fields?.singlePassPortraitVersion===SINGLE_PASS_PORTRAIT_VERSION&&
 fields?.femaleFinishSingleVersion===FEMALE_SINGLE_FINISH_VERSION&&
 fields?.portraitMode==='female'&&['natural','makeup'].includes(fields?.femaleEyeStyle);
