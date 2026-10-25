import {createFemaleFinishProfile,isFemaleFinishProfile,matchFemaleFinishProfile} from './female-finish-profile.js';

// One request per short-lived worker. No model, image cache, persistent state,
// DOM access, or network work; large native-pixel loops stay off the UI thread.
self.addEventListener('message',event=>{
 const input=event.data||{},pixels=input.pixels;
 let response;
 try{
  if(input.profile!=null){
   if(isFemaleFinishProfile(input.profile)){
    const result=matchFemaleFinishProfile(input);
    response={pixels:result.pixels,changed:result.changed,profile:input.profile,report:result.report};
   }else response={pixels,changed:false,profile:null,report:{status:'unavailable',reason:'invalid-profile',changedPixels:0}};
  }else{
   const profile=createFemaleFinishProfile(input);
   response={pixels,changed:false,profile,report:{status:profile?'captured':'unavailable',reason:profile?'accepted-finish-measured':'insufficient-skin-evidence',changedPixels:0}};
  }
 }catch{
  response={pixels,changed:false,profile:isFemaleFinishProfile(input.profile)?input.profile:null,report:{status:'unavailable',reason:'processing-unavailable',changedPixels:0}};
 }
 const buffer=response.pixels?.buffer;
 self.postMessage(response,buffer instanceof ArrayBuffer?[buffer]:[]);
});
