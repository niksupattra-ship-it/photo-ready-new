import thumbnails from './hair-picker-thumbnails.json' with {type:'json'};

// Picker display only. Keep the selected catalog URL, native hair layers and
// AI references intact; thumbnail bytes carry their own content version.
export function hairPickerPreview(source){
 if(typeof source!=='string')return source;
 const path=source.split(/[?#]/,1)[0],thumbnail=thumbnails[path];
 return typeof thumbnail==='string'?thumbnail:source;
}
