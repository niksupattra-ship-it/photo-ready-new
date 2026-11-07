// Preserve explicit natural/makeup choices; missing values never override them.
export function portraitFinishChoice(...choices){
 return choices.find(choice=>choice==='makeup'||choice==='natural'||choice==='korean-rosy-v1'||choice==='soft-rosy-v1')||'natural';
}

export const SOFT_ROSY_PORTRAIT_FINISH={id:'soft-rosy-v1',name:'ละมุน',preview:'/assets/face-finish/makeup.webp'};

// Shared revision for same-choice selection, generation caches and saved heads.
export const NATURAL_FINISH_VERSION='natural-even-soft-retouch-v8';
export const KOREAN_ROSY_FINISH_VERSION='original-makeup-diffuse-light-same-hair-v9';
export const SOFT_ROSY_FINISH_VERSION='foundation-original-cosmetics-v8';
export function portraitFinishIsCurrent(head,finish,mode=head?.portraitMode){
 if(mode==='female'&&finish==='natural')return head?.naturalFinishVersion===NATURAL_FINISH_VERSION;
 if(finish==='soft-rosy-v1')return head?.softRosyFinishVersion===SOFT_ROSY_FINISH_VERSION;
 if(finish==='korean-rosy-v1')return head?.koreanRosyFinishVersion===KOREAN_ROSY_FINISH_VERSION;
 return true;
}
