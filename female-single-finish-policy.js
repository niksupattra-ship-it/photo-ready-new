// New female portraits generate only the user-selected finish on the first
// request. The opposite finish may be generated on demand for the SAME
// immutable, wallet-owned image job, without reserving another credit.
// Old paired jobs remain untouched and replay with their original policy.
export const FEMALE_SINGLE_FINISH_VERSION='female-single-finish-v1';
export const isFemaleSingleFinish=fields=>fields?.femaleFinishSingleVersion===FEMALE_SINGLE_FINISH_VERSION&&fields?.portraitMode==='female'&&['natural','makeup'].includes(fields?.femaleEyeStyle);
export const oppositeFemaleFinish=finish=>finish==='natural'?'makeup':finish==='makeup'?'natural':null;
