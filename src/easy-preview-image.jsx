import React from 'react';

// The menu's smaller display source never replaces an option's native asset.
// A failed small image falls back once, without a render loop or blank tile.
export function EasyPreviewImage({preview,source,loading='eager',...props}){
 return <img key={preview} {...props} src={preview||source} alt="" loading={loading} decoding="async" onError={event=>{
  const image=event.currentTarget;
  if(!source||preview===source||image.dataset.fallback)return;
  image.dataset.fallback='1';image.src=source;
 }}/>;
}
