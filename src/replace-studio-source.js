// Replace only the portrait input and its generated head/hair. Keep the outfit,
// background and accessories, with their existing transforms and edit history.
export function replaceStudioSourceLayers(layers,photo){
 const headIds=new Set(layers.filter(l=>l.kind==='head'||l.name==='หัว · คอ · ผม').map(l=>l.id));
 const next=layers.filter(l=>l.kind!=='source-photo'&&!headIds.has(l.id)&&!headIds.has(l.hairHeadId)&&l.kind!=='hair-preview');
 const suit=next.findIndex(l=>l.kind==='suit'||l.name==='ชุด');
 next.splice(suit<0?next.length:suit,0,photo);
 return next;
}

// Remove only clothing confirmed by the existing person-segmentation model,
// below the chin. Never change RGB pixels or face, skin and hair alpha.
export function removePortraitClothingAlpha(pixels,clothing,skin,hair,width,height,chinY){
 if(!Number.isFinite(chinY)||chinY<0||chinY>=height)return 0;
 const size=width*height*4;
 if([pixels,clothing,skin,hair].some(a=>!a||a.length!==size))throw Error('ขนาดมาสก์ภาพไม่ตรงกัน');
 let removed=0;
 for(let y=Math.ceil(chinY);y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4+3;
  if(pixels[i]&&clothing[i]>=240&&skin[i]<16&&hair[i]<16){pixels[i]=0;removed++}
 }
 return removed;
}
