// Preserve explicit natural/makeup choices; missing values never override them.
export function portraitFinishChoice(...choices){
 return choices.find(choice=>choice==='makeup'||choice==='natural')||'natural';
}
