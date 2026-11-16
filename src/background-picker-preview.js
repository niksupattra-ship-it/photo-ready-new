import previews from './background-picker-previews.json' with {type:'json'};

export function backgroundPickerPreview(source){
 if(typeof source!=='string')return source;
 const preview=previews[source.split(/[?#]/,1)[0]];
 return typeof preview==='string'?preview:source;
}
