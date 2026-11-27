export const FEMALE_HAIR_SUBMISSION_REVISION='female-complete-lab-process-pro-v13';
// Recover only the identical current request. Retired prompt versions never migrate.
export function shouldRecoverHairSubmission(previous,current,status){
 return previous===current&&['queued','processing','completed'].includes(status);
}
