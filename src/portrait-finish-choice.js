// Preserve explicit natural/makeup choices; missing values never override them.
export function portraitFinishChoice(...choices){
 return choices.find(choice=>choice==='makeup'||choice==='natural'||choice==='korean-rosy-v1'||choice==='soft-rosy-v1')||'natural';
}

export const SOFT_ROSY_PORTRAIT_FINISH={id:'soft-rosy-v1',name:'เมคอัพชมพูละมุน · ผิวสว่างนุ่ม',preview:'/assets/face-finish/makeup.webp'};
