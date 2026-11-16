// Prepares paid Studio layers *before* the user presses Edit Photo.
// All access is scoped to the currently authenticated account and the
// seven-day purchased-photo revision. This is only a speed-up; the purchased
// photo on the server remains the source of truth.
import {readPurchasedEditorCache,writePurchasedEditorCache} from './purchased-editor-cache.js';
import {prepareSavedProject} from './saved-project.js';
import {decodedStudioImage} from './studio-image-cache.js';
import {unpackSavedProjectTransfer} from './saved-work-transfer.js';

const active=new Map(),MAX_PREPARED=2;
const cacheKey=(scope,item)=>JSON.stringify([scope,item.id,item.updatedAt,item.expiresAt]);
const imageData=value=>typeof value==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/.test(value);
const isHead=l=>l.kind==='head'||l.kind==='source-photo'||l.name==='หัว · คอ · ผม';

function warmEditorLayers(project,isCurrent){
 const ordered=[
  ...project.layers.filter(isHead),
  ...project.layers.filter(l=>l.kind==='suit'||l.name==='ชุด'),
  ...project.layers.filter(l=>!isHead(l)&&l.kind!=='suit'&&l.name!=='ชุด')
 ];
 const sources=[],unique=new Set();
 for(const layer of ordered){
  if(!imageData(layer.source)||unique.has(layer.source))continue;
  sources.push(layer.source);unique.add(layer.source);
  if(sources.length===6)break;
 }
 // Share promises with Studio's decoded image cache. In particular, predecode
 // the head, suit and background while the customer looks at purchased photos.
 const queue=sources.slice();
 void Promise.allSettled(Array.from({length:Math.min(2,queue.length)},async()=>{
  while(queue.length&&isCurrent()){
   const source=queue.shift();
   await decodedStudioImage(source);
  }
 }));
}

/**
 * Returns a prevalidated, prepared paid editor. Most of the expensive work
 * happens when purchased-photo history appears, not after the Edit click.
 */
export function prefetchPurchasedEditor({item,scope,walletId,request,headers,currentScope,transformWork=async work=>work}){
 if(!item?.id||!item.updatedAt||!item.expiresAt||!walletId||!scope)return Promise.resolve(null);
 const id=cacheKey(scope,item),prior=active.get(id);
 if(prior){active.delete(id);active.set(id,prior);return prior}
 const isCurrent=()=>scope===currentScope()&&Date.parse(item.expiresAt)>Date.now();
 const promise=(async()=>{
  if(!isCurrent())return null;
  let project=await readPurchasedEditorCache({walletId,photoId:item.id,updatedAt:item.updatedAt,expiresAt:item.expiresAt});
  let revision=item.updatedAt;
  if(!project){
   const response=await request('/api/purchased-photos/'+encodeURIComponent(item.id)+'/editor',{
    headers:{...headers(),'X-IDPROM-Project-Transfer':'images-v1','X-IDPROM-Native-Recovery':'1'},cache:'no-store'
   },90000);
   if(!response.ok)throw Error('Unable to prefetch this purchased editor');
   let work=await response.json();
   if(!isCurrent())return null;
   work=await transformWork(work,item);
   if(!isCurrent())return null;
   project=work?.project?.format==='idprom-project-transfer'?unpackSavedProjectTransfer(work.project):work?.project;
   revision=work.updatedAt||revision;
   if(!project?.layers?.length)throw Error('Editable layers unavailable');
   void writePurchasedEditorCache({walletId,photoId:item.id,project,updatedAt:revision,expiresAt:item.expiresAt});
  }
  if(!isCurrent())return null;
  const restored=await prepareSavedProject(project,{decode:decodedStudioImage,fastOpen:true,onValidated:validatedProject=>warmEditorLayers(validatedProject,isCurrent)});
  if(!isCurrent())return null;
  return {work:{project,unlocked:true,updatedAt:revision},restored};
 })().catch(error=>{if(active.get(id)===promise)active.delete(id);throw error});
 active.set(id,promise);
 while(active.size>MAX_PREPARED)active.delete(active.keys().next().value);
 return promise;
}
export function clearPurchasedEditorPrefetch(){active.clear()}
