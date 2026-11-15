import {createHash} from 'node:crypto';

export const validPortraitSubmissionId=value=>typeof value==='string'&&/^submit_[a-f0-9]{36}$/.test(value);
// A wallet-bound, unpredictable submission key gives a lost acknowledgement a
// durable lookup using the existing job primary key; no new table is needed.
export function portraitSubmissionJobId(wallet,submission){
 if(!wallet||!validPortraitSubmissionId(submission))return null;
 return 'job_'+createHash('sha256').update(JSON.stringify(['portrait-submission',wallet,submission])).digest('hex').slice(0,36);
}
