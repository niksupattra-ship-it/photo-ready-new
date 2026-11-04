// Provisional drawing only; this layer never becomes editor/history state.
export function createAssetDisplayPreview(kind,target,option,native,suit){
 const source=native.source,mask=Object.assign(document.createElement('canvas'),{width:source.width,height:source.height}),buffer=document.createElement('canvas');
 const ctx=mask.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,mask.width,mask.height);
 const layer={x:0,y:0,scale:1,rotation:0,opacity:1,...target,id:target?.id||'temporary-'+kind,kind,source,sourceFrame:native.sourceFrame,visible:true,assetId:option.id,mask:null,warpSource:null,neckWidth:0,neckHeight:0,collarParts:native.collarParts};
 Object.assign(layer,{x:suit?.x||0,y:suit?.y||0,scale:suit?.scale||1,rotation:suit?.rotation||0,opacity:1,collarLeftX:0,collarRightX:0,collarLeftY:0,collarRightY:0});
 if(kind==='collar')Object.assign(layer,{collarLeftScale:1,collarRightScale:1,collarLeftRotation:0,collarRightRotation:0});
 const asset={original:source,sourceFrame:native.sourceFrame,mask,buffer,parts:native.collarParts,dirty:true};
 return {layer,asset,release(){for(const surface of [source,mask,buffer,asset.pinComposition,native.collarParts?.left,native.collarParts?.right])if(surface){surface.width=1;surface.height=1}}};
}
