import {isThaiOutfitPath} from '../thai-outfit-ai-policy.js';
export function currentGuideOutfit(layers=[],placement,head,requestedTemplate=''){
 const suits=layers.filter(l=>l.kind==='suit'&&l.templatePath);
 if(requestedTemplate&&suits.some(l=>l.templatePath===requestedTemplate))return requestedTemplate;
 return [...suits].reverse().find(l=>l.visible!==false)?.templatePath||head?.generatedOutfitTemplate||placement?.templatePath||suits[0]?.templatePath||'';
}
export function femaleOutfitGuideRequest({englishFlow,option,head,sourcePhoto,pendingSource=false,aiSetup=false,manualOverride=false}){
 if(englishFlow||!sourcePhoto||pendingSource||aiSetup||manualOverride||!head?.jobId||(head.portraitMode||sourcePhoto.idpromPortraitMode)!=='female'||!isThaiOutfitPath(option?.template)||option.template===head.generatedOutfitTemplate)return null;
 return {template:option.template,portraitMode:'female',hairId:head.hairId||''};
}
