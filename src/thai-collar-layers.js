import {ENGLISH_BODY_PORTRAIT_VERSION} from '../male-portrait-prompt.js';
// A complete AI body already owns its neck and shirt. Old head-only neck
// bridges must not paint a second join over it after restore or hair changes.
export function withoutObsoleteThaiNeckBridges(layers){
 const bodies=new Set(layers.filter(l=>l.visible!==false&&l.portraitComposition===ENGLISH_BODY_PORTRAIT_VERSION).map(l=>l.id));
 if(!bodies.size)return layers;
 const next=layers.filter(l=>l.kind!=='neck-fit'||(l.hairHeadId&&!bodies.has(l.hairHeadId)&&layers.some(h=>h.id===l.hairHeadId)));
 return next.length===layers.length?layers:next;
}
