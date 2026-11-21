// Only the finished-photo picker opts into retaining a customer's manual fit.
// Both its provisional preview and committed native asset use these values.
export function governmentResultManualInsigniaPlacement(target){
 if(!target?.easyInsigniaManualPlacement)return null;
 return {
  x:target.x||0,y:target.y||0,scale:target.scale||1,rotation:target.rotation||0,
  squeezeX:1,squeezeY:1,
  collarLeftX:target.collarLeftX||0,collarLeftY:target.collarLeftY||0,
  collarRightX:target.collarRightX||0,collarRightY:target.collarRightY||0,
  collarLeftScale:target.collarLeftScale||1,collarRightScale:target.collarRightScale||1,
  collarLeftRotation:target.collarLeftRotation||0,collarRightRotation:target.collarRightRotation||0,
  easyInsigniaManualPlacement:true
 };
}
