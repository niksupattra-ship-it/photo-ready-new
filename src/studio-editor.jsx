import {EasyMode,EasyAdjustmentTabs,EasyUIIcon} from './easy-mode.jsx';
import {FemaleFaceCompare} from './female-face-compare.jsx';
import {replaceStudioSourceLayers} from './replace-studio-source.js';
import {ProcessResultNotice,processResultKind} from './process-result-notice.jsx';
import {StudioBackgroundColor} from './studio-background-color.jsx';
import {portraitFinishChoice} from './portrait-finish-choice.js';
import {createPortal} from 'react-dom';
import {PHOTO_SIZES,DEFAULT_PHOTO_CROP,PhotoSizeEditor,cropPhotoForDownload} from './photo-size.jsx';
import {outputAccessResult,unavailableOutputRights,mergeOutputRights} from './output-rights.js';
import {makeSavedProject} from './saved-project.js';
import {replaceHairstyleLayer} from './replace-hairstyle-layer.js';
import {HAIR_DESIGN_VERSION} from '../hairstyle-catalog.js';
import {splitNativeCollarParts} from './collar-native-parts.js';
import {isTrialHairAllowed} from '../hairstyle-catalog.js';
import {isFreeFemaleHair,FREE_FEMALE_HAIR_MESSAGE} from './free-female-hair.js';
import {stepHairRail,restoreHairRail,stopHairRail} from './studio-hair-rail.js';
import {analyticsSelection} from './analytics.js';
import './studio-face-previews.css';
import {studioMakeupBase} from './studio-makeup-base.js';
import './studio-desktop-credits.css';
import {StudioMobileFileMenu} from './studio-mobile-file-menu.jsx';
import './studio-mobile-controls.css';
import {createHairStyleMemory} from './studio-hair-style-memory.js';
import {layerAxes,layerToScene,sceneToLayer,anchoredTransform,squeezeTransform,squeezePointer} from './studio-transform.js';
import {isSingleFemaleHair,isSingleLayerHair} from './short-female-hair.js';
import {headPose,syncHairAttachments,syncHairPairTransforms} from './hair-preview-fit.js';
import {StudioPhotoGuide} from './studio-photo-guide.jsx';
import {StudioFileActions} from './studio-file-actions.jsx';
import {ProcessingCloseButton} from './processing-close-button.jsx';
import {deliverImage,dismissFileSavePanel} from './image-download.js';
import {withDeadline} from './async-deadline.js';
import {createBrowserId,listenMediaQuery,observeElementResize,lastItem,isPrimaryEditingPointer,hasSecondaryPointerButton,preventEditorControlContextMenu} from './browser-compat.js';
import React,{useEffect,useRef,useState} from 'react';
import './studio-editor.css';
import {STUDIO_ACCESSORY_PLACEMENT} from './studio-accessory-placement.js';
import {TouchParts,TouchAdjust,partName} from './studio-touch.jsx';
import {StudioChoiceIcon,StudioToolIcon} from './studio-icons.jsx';
import {liquifyCanvas} from './studio-liquify.js';
import {pixelEraserStroke,preparePixelSurface,brushSceneRegion} from './studio-pixel-eraser.js';
import {warpStudioCollar,invalidateCollarSource} from './studio-collar.js';
import {nativeAsset,nativeSource} from './studio-source.js';
import {fitStudioSuit,STUDIO_SUIT_FIT_VERSION} from './studio-suit-fit.js';
import {prepareSavedProject} from './saved-project.js';
import {preparePhotoInput} from './photo-input.js';
import {decodedStudioImage as image} from './studio-image-cache.js';
import thumbnailMap from './studio-thumbnail-map.json';
import {MakeupPanel} from './studio-makeup.jsx';
import {makeupLook} from '../makeup-presets.js';
import {createMakeupLookCache,mixMakeupLookSources} from './makeup-look-tools.js';
function CatalogPreview({src,eager=false,maleHair=false}){
 const closeMalePreview=maleHair&&/\/seedream-hairstyles\/previews\/(?:36|37)\.webp(?:\?|$)/.test(src);
 return <img src={thumbnailMap[src]||src} alt="" loading={eager?'eager':'lazy'} decoding="async" width="96" height="96" style={maleHair?{objectFit:'cover',objectPosition:closeMalePreview?'50% 57.5%':'50% 12%',transform:closeMalePreview?'scale(1.01)':'scale(1.35)',transformOrigin:'50% 12%'}:(src.includes('/female-hair-catalog-v12/')||src.includes('/seedream-hairstyles/'))?{objectFit:'contain',objectPosition:'center',transform:'none',transformOrigin:'center'}:undefined} onError={e=>{if(e.currentTarget.dataset.fallback)return;e.currentTarget.dataset.fallback='1';e.currentTarget.src=src}}/>;
}
const STUDIO_DOWNLOAD_SIZES=PHOTO_SIZES.filter(s=>['original','1-inch','1.5-inch','2-inch','2.5-inch'].includes(s.id));
const W=900,H=1200;
const canvas=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
const nativeCanvas=()=>{const w=2256,h=3072;return Object.assign(document.createElement('canvas'),{width:Math.round(Math.max(1,Math.min(8192,w))),height:Math.round(Math.max(1,Math.min(8192,h)))})};

function paintOriginal(ctx,im){ctx.setTransform(1,0,0,1,0,0);const w=ctx.canvas.width,h=ctx.canvas.height;ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';const scale=Math.min(w/im.width,h/im.height);ctx.drawImage(im,(w-im.width*scale)/2,(h-im.height*scale)/2,im.width*scale,im.height*scale)}
// History retains lossless native surfaces; PNG encoding is reserved for file saves.
const copySurface=src=>{if(!src)return null;const c=Object.assign(document.createElement('canvas'),{width:src.width,height:src.height});c.getContext('2d').drawImage(src,0,0);return c};
const surfaceURL=src=>src instanceof HTMLCanvasElement?src.toDataURL():src;
function dirtyRegion(a,rect){a.dirty=true;if(!rect){a.dirtyRect=null;return}if(a.dirtyRect===null)return;const old=a.dirtyRect;if(!old)a.dirtyRect=rect;else{const x=Math.min(old.x,rect.x),y=Math.min(old.y,rect.y);a.dirtyRect={x,y,w:Math.max(old.x+old.w,rect.x+rect.w)-x,h:Math.max(old.y+old.h,rect.y+rect.h)-y}}}
// Keep slider drag updates inside this small control, not the whole editor.
function BrushSizeRange({value,min,max,onCommit,onPreview,ariaLabel}){
 const [size,setSize]=useState(value),latest=useRef(value);
 useEffect(()=>{latest.current=value;setSize(value)},[value]);
 const update=n=>{latest.current=n;setSize(n);onPreview(n)};
 const commit=()=>onCommit(latest.current);
 return <label className="studio-compact-range"><span>ขนาด</span><output>{size} px</output><button aria-label="ลดขนาด" onClick={()=>{update(Math.max(min,latest.current-1));commit()}}>−</button><input aria-label={ariaLabel} type="range" min={min} max={max} value={size} onChange={e=>update(+e.target.value)} onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}/><button aria-label="เพิ่มขนาด" onClick={()=>{update(Math.min(max,latest.current+1));commit()}}>+</button></label>
}
function desktopStepValue(value,min,max,step,direction){return Math.min(max,Math.max(min,Number((Number(value)+step*direction).toFixed(4))))}
function DesktopRange({label,value,min,max,step=1,display,onValue,onStart,children}){
 const latest=useRef(value),lastStep=useRef(-Infinity);latest.current=value;
 const adjust=direction=>{const next=desktopStepValue(latest.current,min,max,step,direction);if(next===latest.current)return;const now=performance.now();if(now-lastStep.current>300)onStart?.();lastStep.current=now;latest.current=next;onValue(next)};
 return <label className="studio-desktop-step-range"><span>{label}</span><output>{display}</output><button type="button" aria-label={'ลด'+label} disabled={value<=min} onClick={()=>adjust(-1)}>−</button>{children}<button type="button" aria-label={'เพิ่ม'+label} disabled={value>=max} onClick={()=>adjust(1)}>+</button></label>;
}
const uid=createBrowserId;
const ASSET_NAMES={suit:'ชุด',collar:'เข็มปกคอ',chest:'เข็มติดอก',ribbon:'แพรแถบ',background:'พื้นหลัง'};
const layerKind=l=>l.kind||Object.keys(ASSET_NAMES).find(k=>ASSET_NAMES[k]===l.name);
function fresh(layer){return {id:uid(),name:layer.name,source:layer.source,mask:null,x:0,y:0,scale:1,rotation:0,visible:true,locked:false,opacity:1,...layer,kind:layerKind(layer),id:uid()}}
function freshLinkedLayers(input){
 const next=input.map(l=>fresh((layerKind(l)==='head'||l.name==='หัว · คอ · ผม')?{...l,processedOriginalSource:l.processedOriginalSource||l.makeupBaseSource||l.hairOriginalSource||l.source}:l)),ids=new Map(input.filter(l=>l.id).map(l=>[l.id,next[input.indexOf(l)].id]));
 return next.map(l=>l.hairHeadId?{...l,hairHeadId:ids.get(l.hairHeadId)||l.hairHeadId}:l);
}
function paintLayers(ctx,layers,assets,allLayers=layers){
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.setTransform(ctx.canvas.width/W,0,0,ctx.canvas.height/H,0,0);
 for(const l of layers){if(!l.visible||(l.hairHeadId&&!allLayers.find(p=>p.id===l.hairHeadId)?.visible))continue;const a=assets.get(l.id);if(!a)continue;
  if(a.parts){const key=[l.collarLeftX||0,l.collarRightX||0,l.collarLeftY||0,l.collarRightY||0].join(',');if(a.partOffsets!==key){const composed=Object.assign(document.createElement('canvas'),{width:a.parts.left.width,height:a.parts.left.height}),cc=composed.getContext('2d'),ratio=composed.width/(l.sourceFrame?.w||W);cc.drawImage(a.parts.left,(l.collarLeftX||0)*ratio,(l.collarLeftY||0)*ratio);cc.drawImage(a.parts.right,(l.collarRightX||0)*ratio,(l.collarRightY||0)*ratio);a.original=composed;a.partOffsets=key;a.dirty=true;a.dirtyRect=null;a.bounds=null}}
  if(l.kind==='suit'||l.name==='ชุด'){
   const src=a.warped||a.original,key=(l.neckWidth||0)+','+(l.neckHeight||0);
   if(a.collarKey!==key||a.collarSource!==src){
    const logical=l.collarFrame||{x:0,y:0,w:W,h:H},f=l.sourceFrame||{x:0,y:0,w:W,h:H},frame={x:(logical.x-f.x)*src.width/f.w,y:(logical.y-f.y)*src.height/f.h,w:logical.w*src.width/f.w,h:logical.h*src.height/f.h};
    a.collarRendered=warpStudioCollar(src,(l.neckWidth||0)/100,(l.neckHeight||0)/100,frame,{smoothTop:(l.templatePath||'').includes('/job-uniforms/')});a.collarKey=key;a.collarSource=src;a.dirty=true;a.dirtyRect=null;
   }
  }
  if(a.dirty){const src=a.collarRendered||a.warped||a.original,bw=src.width,bh=src.height;let region=a.dirtyRect;if(a.buffer.width!==bw||a.buffer.height!==bh){a.buffer.width=bw;a.buffer.height=bh;region=null}const cx=a.buffer.getContext('2d');cx.save();if(region){cx.beginPath();cx.rect(region.x,region.y,region.w,region.h);cx.clip()}cx.clearRect(0,0,bw,bh);cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';if(region&&a.directPixelsReady)cx.drawImage(src,region.x,region.y,region.w,region.h,region.x,region.y,region.w,region.h);else cx.drawImage(src,0,0);cx.globalCompositeOperation='destination-in';if(region&&a.directPixelsReady)cx.drawImage(a.mask,region.x*a.mask.width/bw,region.y*a.mask.height/bh,region.w*a.mask.width/bw,region.h*a.mask.height/bh,region.x,region.y,region.w,region.h);else cx.drawImage(a.mask,0,0,bw,bh);cx.restore();a.dirty=false;a.dirtyRect=undefined}
  ctx.save();ctx.translate(W/2+l.x,H/2+l.y);ctx.rotate(l.rotation*Math.PI/180);ctx.scale(layerAxes(l).x,layerAxes(l).y);ctx.globalAlpha=l.opacity;const frame=l.sourceFrame||{x:0,y:0,w:W,h:H};ctx.drawImage(a.buffer,frame.x-W/2,frame.y-H/2,frame.w,frame.h);ctx.restore();
 }
}
const sceneCaches=new WeakMap();
export function paintScene(ctx,layers,assets,activeId=null,damage=null){
 // Rotated edges need the same full-scene sampling used by export.
 if(damage&&layers.some(l=>l.visible&&l.opacity>0&&l.rotation))damage=null;
 const index=layers.some(l=>l.hairHeadId===activeId)||layers.find(l=>l.id===activeId)?.hairHeadId?-1:layers.findIndex(l=>l.id===activeId);
 if(index<0){sceneCaches.delete(ctx.canvas);paintLayers(ctx,layers,assets);return}
 const staticLayers=layers.filter(l=>l.id!==activeId);let cache=sceneCaches.get(ctx.canvas);
 if(!cache||cache.assets!==assets||cache.activeId!==activeId||cache.width!==ctx.canvas.width||cache.height!==ctx.canvas.height||cache.layers.length!==staticLayers.length||staticLayers.some((l,i)=>cache.layers[i]!==l||assets.get(l.id)?.dirty)){
 const make=()=>Object.assign(document.createElement('canvas'),{width:ctx.canvas.width,height:ctx.canvas.height});cache={assets,activeId,width:ctx.canvas.width,height:ctx.canvas.height,layers:staticLayers,under:make(),over:make(),active:make()};paintLayers(cache.under.getContext('2d'),layers.slice(0,index),assets,layers);paintLayers(cache.over.getContext('2d'),layers.slice(index+1),assets,layers);sceneCaches.set(ctx.canvas,cache)}
 paintLayers(cache.active.getContext('2d'),[layers[index]],assets,layers);
 // Reuse the unchanged layers during a brush stroke, including rotated layers.
 // Keep full-scene sampling; clip only the final composite on unrotated scenes.
 ctx.save();ctx.setTransform(1,0,0,1,0,0);
 if(damage){ctx.beginPath();ctx.rect(damage.x,damage.y,damage.w,damage.h);ctx.clip()}
 ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.drawImage(cache.under,0,0);ctx.drawImage(cache.active,0,0);ctx.drawImage(cache.over,0,0);ctx.restore();
}
export function StudioEditor({initialLayers,initialEasy=false,accountScope='',downloadUnlockSignal=null,onSelectSuit,onMeasureSuitFace,onLogout,onNewSource,templates=[],collarPins=[],chestPins=[],ribbons=[],backgrounds=[],maleHair=[],femaleHair=[],paidHairAccess=false,trialHairRemaining=0,onChangeHair,onHairAiAccess,onPrepareHairOverlay,canReuseHair=()=>false,onMakeup,placement,onProcessPhoto,onBeforeProcess,onReadProcessBalance,processing=false,processProgress={},onCancelProcess,onFinishProcess,isProcessCancelled=()=>false,processRemaining=0,paidRemaining,trialRemaining,trialUnlocked=false,hasCredits=trialUnlocked,allOptionsAvailable=false,paidOutputIds=[],editableOutputIds=[],fullCatalog=false,freeTemplatePaths=[],purchaseSnapshotRef,initialSourcePhoto=null,editingPurchasedImage=false,savedWorkUnlocked=false,onSaveWork,memberMenu=null,accountSaveNotice,onOpenProject,onOpenSavedWorks,onVerifyOutput,onOpenRights,onRequestUnlock,onClose}){
 const [easyMode,setEasyMode]=useState(initialEasy);
 const [layers,setLayers]=useState(()=>freshLinkedLayers(initialLayers)),[selected,setSelected]=useState(null),[tool,setToolState]=useState('move'),[brush,setBrush]=useState(40),[soft,setSoft]=useState(30),[eraseOpacity,setEraseOpacity]=useState(100),[paintColor,setPaintColor]=useState('#e7b2a0'),[paintOpacity,setPaintOpacity]=useState(100),[view,setView]=useState({zoom:1,x:0,y:0}),[ready,setReady]=useState(false),[status,setStatus]=useState('กำลังเตรียมเลเยอร์…'),[revision,setRevision]=useState(0),[comparing,setComparing]=useState(false),[picker,setPicker]=useState(false),[warpMode,setWarpMode]=useState('push'),[warpSize,setWarpSize]=useState(120),[warpStrength,setWarpStrength]=useState(40),[cursor,setCursor]=useState(null),[assetBusy,setAssetBusy]=useState(false),[assetGroup,setAssetGroup]=useState('all'),[sourcePhoto,setSourcePhoto]=useState(initialSourcePhoto),[sourcePreview,setSourcePreview]=useState(null),[processingPhoto,setProcessingPhoto]=useState(false),[hairGender,setHairGender]=useState(()=>initialLayers.find(l=>layerKind(l)==='head')?.portraitMode||'female'),[selectedHair,setSelectedHair]=useState(()=>initialLayers.find(l=>layerKind(l)==='head')?.hairId||initialLayers.find(l=>l.kind==='hair-preview')?.hairId||'');
 const [touch,setTouch]=useState(()=>matchMedia('(max-width:1100px), (pointer:coarse) and (max-width:1366px)').matches),[touchOpen,setTouchOpen]=useState(false),[touchTab,setTouchTab]=useState('position'),[touchSide,setTouchSide]=useState('both'),[collarSide,setCollarSide]=useState('auto'),[touchMore,setTouchMore]=useState(false),[touchMenu,setTouchMenu]=useState(false),[layerGuide,setLayerGuide]=useState(false),[toolRailOpen,setToolRailOpen]=useState(true),[exitPrompt,setExitPrompt]=useState(false),[hairConfirmed,setHairConfirmed]=useState(false),[outlineRatio,setOutlineRatio]=useState(1),[selectionBoxes,setSelectionBoxes]=useState([]),[touchThumbnails,setTouchThumbnails]=useState({});
 const [touchLayersOpen,setTouchLayersOpen]=useState(false);
 const [touchToolsOpen,setTouchToolsOpen]=useState(false);
 const touchToolsButtonRef=useRef(null),touchToolsMenuRef=useRef(null);
 const brushSession=useRef(null),[brushLayerRequired,setBrushLayerRequired]=useState(false);
 const setTool=id=>{if(brushSession.current&&id!==brushSession.current.tool)return;setToolState(id);setStatus('')};
 const resetBrushSession=()=>{brushSession.current=null;setBrushLayerRequired(false);setCursor(null);setLayerGuide(false)};
 const [compareReady,setCompareReady]=useState(false);const compareSourceRef=useRef(null);
 useEffect(()=>{if(!touch||!touchLayersOpen)return;const outside=e=>{if(e.target.closest('.studio-touch-layer-picker,.studio-floating-layers'))return;setTouchLayersOpen(false)};document.addEventListener('pointerdown',outside,true);return()=>document.removeEventListener('pointerdown',outside,true)},[touch,touchLayersOpen]);
 const [hairNotice,setHairNotice]=useState(false),[processHairPending,setProcessHairPending]=useState(false);
 const processRequestRef=useRef(false);
 const [hairPlacementProgress,setHairPlacementProgress]=useState(null);
 const [appearanceError,setAppearanceError]=useState(null);
 const appearanceFailure=(kind,message)=>{setAppearanceError({kind,message});setStatus(message)};
 const [hairAiRemaining,setHairAiRemaining]=useState(null);
 const [hairAiUnlimited,setHairAiUnlimited]=useState(false);
 const hairAccessRequest=useRef(0);
 const hairAccessJob=layers.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม')?.jobId||'';
 const refreshHairAiAccess=async()=>{const request=++hairAccessRequest.current;const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');if(!head?.jobId||!onHairAiAccess){setHairAiRemaining(null);setHairAiUnlimited(false);return}try{const a=await onHairAiAccess(head.jobId);if(mounted.current&&request===hairAccessRequest.current){setHairAiUnlimited(a.unlimited===true);setHairAiRemaining(a.unlimited?null:a.remaining)}}catch{if(mounted.current&&request===hairAccessRequest.current){setHairAiRemaining(null);setHairAiUnlimited(false)}}};
 const hairRailPositions=useRef({female:0,male:0});
 const hairUiFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 useEffect(()=>{if(picker!=='hair')return;const rail=catalogRailRef.current,frame=requestAnimationFrame(()=>restoreHairRail(rail,hairRailPositions.current[hairGender]));return()=>{cancelAnimationFrame(frame);stopHairRail(rail)}},[picker,hairGender,selectedHair]);
 const [portraitMode,setPortraitMode]=useState(()=>initialLayers.find(l=>layerKind(l)==='head')?.portraitMode||null),[portraitChoiceOpen,setPortraitChoiceOpen]=useState(false);
 const [femaleFinishChoiceOpen,setFemaleFinishChoiceOpen]=useState(false);
 const [easyPhotoTypeSelected,setEasyPhotoTypeSelected]=useState(()=>Boolean(initialLayers.find(l=>layerKind(l)==='head')));
 const [easyFaceFinish,setEasyFaceFinish]=useState(()=>initialLayers.find(l=>layerKind(l)==='head')?.femaleEyeStyle||'natural');
 const pendingHairProcessRef=useRef(null);
 const [portraitProcessError,setPortraitProcessError]=useState(null);
 const [backgroundColorOpen,setBackgroundColorOpen]=useState(false);
 const [downloadCrop,setDownloadCrop]=useState(null),[downloadCropBusy,setDownloadCropBusy]=useState(false);
 const [processReceipt,setProcessReceipt]=useState(null);
 const receiptRequestRef=useRef(0),lastSaveErrorRef=useRef(null),lastSavedLayersRef=useRef(null);
 const hasUnsavedWork=()=>state.current.some(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม')&&(lastSavedLayersRef.current!==state.current||pendingTransforms.current.size>0||['erase','restore','warp','paint'].includes(gesture.current?.kind));
 const [savePopup,setSavePopup]=useState(null);const savingRef=useRef(false),exportingRef=useRef(false),savingDoneRef=useRef(null),saveSequenceRef=useRef(0),downloadSaveQueueRef=useRef(Promise.resolve()),historyTruncatedRef=useRef(false),historyBoundaryNoticeRef=useRef(false);
 useEffect(()=>{if(accountSaveNotice){setSavePopup(accountSaveNotice);setStatus(accountSaveNotice.message)}},[accountSaveNotice]);

 const [historyNotice,setHistoryNotice]=useState(null);
 const [makeupStyles,setMakeupStyles]=useState({}),[makeupBusy,setMakeupBusy]=useState(false);const makeupRequestRef=useRef(false),makeupLookCacheRef=useRef(null);
 useEffect(()=>{if(picker==='hair')void refreshHairAiAccess()},[picker,hairAccessJob,assetBusy]);
 const [makeupIntensity,setMakeupIntensity]=useState(100);
 if(!makeupLookCacheRef.current)makeupLookCacheRef.current=createMakeupLookCache();
 const makeupHead=layers.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
 useEffect(()=>{setMakeupStyles(makeupHead?.makeupStyles||{});setMakeupIntensity(makeupHead?.makeupIntensity??100)},[makeupHead?.id,makeupHead?.source,makeupHead?.makeupStyles,makeupHead?.makeupIntensity]);
 useEffect(()=>{if(hairConfirmed)setHairNotice(false)},[hairConfirmed]);
 const partRailRef=useRef(),desktopLayersRef=useRef(),brushPreviewActive=useRef(false),stageRef=useRef(),outlineRef=useRef(),penPointerRef=useRef(null);
 useEffect(()=>{const mq=matchMedia('(max-width:1100px), (pointer:coarse) and (max-width:1366px)'),update=()=>setTouch(mq.matches);return listenMediaQuery(mq,update)},[]);
 const reopenCurrentToolAdjust=()=>{
  if(!touch||hydratingRef.current||!ready||assetBusy||processActive||comparing)return;
  setTouchToolsOpen(false);setPicker(false);setTouchMenu(false);setCursor(null);
  const session=brushSession.current,target=state.current.find(l=>l.id===(session?.layerId||selectedRef.current));
  // Only an unfinished selection needs the layer picker again.
  if((session?.awaitingLayer||(!target&&tool!=='pan'))){
   setTouchLayersOpen(true);setLayerGuide(true);setTouchOpen(false);setTouchMore(false);setToolRailOpen(true);return;
  }
  setTouchLayersOpen(false);setLayerGuide(false);setToolRailOpen(true);
  const position=['move','transform'].includes(tool);
  setTouchOpen(position);setTouchMore(position?false:'tool');
 };
 const clearTouchSelection=()=>{setTool('pan');selectedRef.current=null;setTouchLayersOpen(false);setToolRailOpen(true);setSelected(null);setLayerGuide(false);setTouchOpen(false);setTouchMore(false);setTouchMenu(false);setPicker(false);setCursor(null);setStatus('')};
 const choosePart=id=>{
  const session=brushSession.current;
  if(session){
   if(id===null){session.awaitingLayer=true;setBrushLayerRequired(true);setTouchLayersOpen(touch);setLayerGuide(true);setStatus('');return}
   const target=state.current.find(l=>l.id===id);
   if(!target||target.locked||!target.visible){setStatus('เลือกเลเยอร์ที่แสดงอยู่และปลดล็อกก่อน');return}
   session.layerId=target.id;session.awaitingLayer=false;setBrushLayerRequired(false);setTool(session.tool);selectedRef.current=target.id;setSelected(target.id);setTouchLayersOpen(false);setLayerGuide(false);setToolRailOpen(true);setTouchOpen(false);setTouchMore(touch?'tool':false);setPicker(false);setCursor(null);setStatus('');return;
  }
  setTouchLayersOpen(false);if(id===null){clearTouchSelection();return}
  setTool('move');setToolRailOpen(false);setLayerGuide(false);setSelected(id);selectedRef.current=id;setTouchOpen(touch);setTouchMore(false);setTouchSide('both');setPicker(false);
 };
 const chooseCanvasTool=id=>{
  if(hydratingRef.current||!ready||assetBusy||processActive||comparing)return true;
  if(id==='erase'||id==='warp'||id==='paint'){
   brushSession.current={tool:id,layerId:null,awaitingLayer:true};setBrushLayerRequired(true);setTool(id);setCursor(null);setLayerGuide(true);setTouchLayersOpen(touch);setToolRailOpen(true);setPicker(false);setTouchMore(false);setTouchOpen(false);setTouchMenu(false);
   if(!touch)desktopLayersRef.current?.scrollIntoView({block:'nearest'});setStatus('');return true;
  }
  const previousId=brushSession.current?.layerId||selectedRef.current;brushSession.current=null;setBrushLayerRequired(false);
  if(id==='move'){
   const l=state.current.find(l=>l.id===previousId);selectedRef.current=l?.id||null;setSelected(l?.id||null);setTool('move');setCursor(null);setLayerGuide(!l);setTouchLayersOpen(false);setToolRailOpen(true);setPicker(false);setTouchOpen(false);setTouchMore(false);setTouchMenu(false);setStatus('');return true;
  }
  return false;
 };
 const selectEditorTool=id=>{if(touch){setTouchToolsOpen(false);if(hydratingRef.current||!ready||assetBusy||processActive||comparing)return}if(chooseCanvasTool(id)){if(touch&&id==='move'){const target=state.current.find(l=>l.id===selectedRef.current);setTouchLayersOpen(!target);setLayerGuide(!target);setTouchOpen(Boolean(target))}return;}setTool(id);setCursor(null);setLayerGuide(!current&&id!=='pan');if(id==='neck'&&!touch){const suit=neckSuit();setSelected(suit?.id||null);setLayerGuide(false);if(!suit)setStatus('เลือกชุดก่อนปรับคอเสื้อ')}if(!touch&&id!=='pan')desktopLayersRef.current?.scrollIntoView({block:'nearest'});if(touch){if(id==='neck'){const suit=neckSuit();setSelected(suit?.id||null);setLayerGuide(false);setTouchLayersOpen(false);setToolRailOpen(!suit);setPicker(false);setTouchOpen(false);setTouchMore(suit?'tool':false);setTouchMenu(false);if(!suit)setStatus('เลือกชุดก่อนปรับคอเสื้อ');return}const reopen=Boolean(current);setTouchLayersOpen(!reopen&&id!=='pan');setToolRailOpen(true);setPicker(false);setTouchMore(reopen&&!['move','transform'].includes(id)?'tool':false);setTouchOpen(reopen&&['move','transform'].includes(id));if(id==='transform')setTouchTab('scale');setTouchMenu(false)}};
 const pickerDrawerRef=useRef(null),pickerSwipeRef=useRef(null),pickerSuppressClickRef=useRef(0);
 useEffect(()=>{
  if(!picker)return;
  const outside=e=>{
   if(e.target.closest?.('.studio-picker-drawer,.studio-bottom-choices,.studio-processing-overlay'))return;
   setPicker(false);
  };
  const escape=e=>{if(e.key==='Escape')setPicker(false)};
  document.addEventListener('pointerdown',outside,true);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape)};
 },[picker]);
 const startPickerSwipe=e=>{
  if(e.pointerType!=='touch'||e.target.closest('input,select,textarea'))return;
  if(pickerSwipeRef.current){pickerSwipeRef.current=null;return}
  pickerSwipeRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};
 };
 const movePickerSwipe=e=>{
  const start=pickerSwipeRef.current;if(!start||start.id!==e.pointerId)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(Math.abs(dx)>24&&Math.abs(dx)>Math.abs(dy)){pickerSwipeRef.current=null;return}
  if(dy>55&&dy>Math.abs(dx)*1.5){
   e.preventDefault();pickerSuppressClickRef.current=Date.now()+500;
   pickerSwipeRef.current=null;setPicker(false);
  }
 };
 const endPickerSwipe=e=>{if(pickerSwipeRef.current?.id===e.pointerId)pickerSwipeRef.current=null};
 const canvasRef=useRef(),assets=useRef(new Map()),state=useRef(layers),selectedRef=useRef(selected),undo=useRef([]),redo=useRef([]),pointers=useRef(new Map()),gesture=useRef(null),fileRef=useRef(),mounted=useRef(true),photoInputRef=useRef(),sourceLayerRef=useRef(null),catalogRailRef=useRef(),before=useRef(),loading=useRef(0),viewRef=useRef(view),placementRef=useRef(placement);
 const suitRailPositions=useRef(Object.create(null));
 const rememberSuitRail=()=>{if(picker==='suit'&&catalogRailRef.current)suitRailPositions.current[assetGroup]=catalogRailRef.current.scrollLeft};
 const committedLayers=useRef(layers);if(committedLayers.current!==layers){committedLayers.current=layers;state.current=layers}selectedRef.current=selected;
 const makeupOperationRef=useRef(null);
 const [makeupProgress,setMakeupProgress]=useState(0);
 const makeupProgressTimer=useRef(null);
 const stopMakeupProgress=()=>{clearInterval(makeupProgressTimer.current);makeupProgressTimer.current=null};
 // Estimated waiting progress; only a committed, visible result can reach 100%.
 const startMakeupProgress=()=>{stopMakeupProgress();setMakeupProgress(1);makeupProgressTimer.current=setInterval(()=>setMakeupProgress(v=>v>=94?v:Math.min(94,v+Math.max(.15,(94-v)*.025))),700)};
 const finishMakeupProgress=async()=>{stopMakeupProgress();if(!mounted.current)return;setMakeupProgress(100);await new Promise(resolve=>setTimeout(resolve,350))};
 const [makeupCancelled,setMakeupCancelled]=useState(false);
 const closeProcessing=async()=>{
  if(makeupBusy){
   makeupOperationRef.current?.abort();stopMakeupProgress();setMakeupCancelled(true);
   setStatus('ยกเลิกการประมวลผลแล้ว · เก็บภาพเดิมไว้');
  }else await onCancelProcess?.();
 };
 useEffect(()=>()=>{makeupOperationRef.current?.abort();stopMakeupProgress()},[]);
 const processActive=processing||processingPhoto||makeupBusy||Boolean(processProgress.active);
 useEffect(()=>{
  if(!touch||touchLayersOpen||picker||touchOpen||touchMore||processActive||assetBusy)setTouchToolsOpen(false);
 },[touch,touchLayersOpen,picker,touchOpen,touchMore,processActive,assetBusy]);
 useEffect(()=>{
  if(!touch||!touchToolsOpen)return;
  const outside=e=>{
   if(e.target.closest?.('.studio-mobile-tool-menu,.studio-floating-tools'))return;
   setTouchToolsOpen(false);
   // A tap to dismiss the tool menu must not paint or move the photo.
   if(e.target.closest?.('.studio-stage')){e.preventDefault();e.stopPropagation()}
  };
  const escape=e=>{if(e.key==='Escape'){e.preventDefault();setTouchToolsOpen(false);touchToolsButtonRef.current?.focus()}};
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape)};
 },[touch,touchToolsOpen]);
 const toggleTouchTools=e=>{
  const opening=!touchToolsOpen;setTouchToolsOpen(opening);setTouchLayersOpen(false);setTouchOpen(false);setTouchMore(false);setPicker(false);setTouchMenu(false);
  if(opening&&e.detail===0)requestAnimationFrame(()=>touchToolsMenuRef.current?.querySelector('button:not(:disabled)')?.focus());
 };
 const processLate=Number(processProgress.value)>=90;
 const displayProgress=makeupBusy?makeupProgress:(Number(processProgress.value)||1);
 const processLabel=makeupBusy?'กำลังปรับผิว':Number(processProgress.value)>=100?'ภาพพร้อมแล้ว':processLate?'กำลังเก็บรายละเอียดภาพ…':(processProgress.label||'กำลังประมวลผลรูป…');
 useEffect(()=>{setLayers(ls=>{let changed=false;const next=ls.map(l=>{if(layerKind(l)!=='head'&&l.name!=='หัว · คอ · ผม')return l;const unlocked=trialUnlocked||paidOutputIds.includes(l.jobId),edit=editableOutputIds.includes(l.jobId);if((unlocked&&l.restrictedTrial)||(edit&&!l.fullEditUnlocked)){changed=true;return {...l,restrictedTrial:unlocked?false:l.restrictedTrial,outputUnlocked:unlocked||l.outputUnlocked,fullEditUnlocked:edit||l.fullEditUnlocked}}return l});return changed?next:ls})},[trialUnlocked,paidOutputIds,editableOutputIds]);
 // Cached preview rights and delayed checks belong to one account session.
 const [outputRights,setOutputRights]=useState(()=>({scope:accountScope,jobs:{}}));
 const sessionUnlockedJobs=useRef(new Set());
 const outputScopeRef=useRef(accountScope);
 if(outputScopeRef.current!==accountScope){outputScopeRef.current=accountScope;sessionUnlockedJobs.current.clear()}
 const verifiedJobs=outputRights.scope===accountScope?outputRights.jobs:{};
 const setVerifiedJobs=update=>setOutputRights(previous=>{
  if(outputScopeRef.current!==accountScope)return previous;
  return {scope:accountScope,jobs:update(previous.scope===accountScope?previous.jobs:{})};
 });
 const outputHeads=ls=>ls.filter(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
 const outputKey=outputHeads(layers).map(l=>l.jobId||'missing').join('|');
 useEffect(()=>{let cancelled=false;const heads=outputHeads(layers);
  Promise.all(heads.map(async l=>{try{return [l.jobId,await onVerifyOutput?.(l.jobId)||unavailableOutputRights()]}catch{return [l.jobId,unavailableOutputRights()]}})).then(results=>{
   if(cancelled||outputScopeRef.current!==accountScope)return;
   for(const [id,right] of results)if(right?.unlocked===true)sessionUnlockedJobs.current.add(id);
   setVerifiedJobs(previous=>mergeOutputRights(previous,results));
  });return()=>{cancelled=true};
 },[accountScope,outputKey,paidOutputIds,onVerifyOutput,trialUnlocked,hasCredits,editingPurchasedImage,downloadUnlockSignal]);
 const sessionAllowsOutput=heads=>trialUnlocked||hasCredits||editingPurchasedImage||savedWorkUnlocked||heads.every(l=>sessionUnlockedJobs.current.has(l.jobId));
 const restrictedTrial=outputHeads(layers).length?!outputHeads(layers).every(l=>verifiedJobs[l.jobId]?.unlocked):!hasCredits&&!trialUnlocked;
 const allowOutput=async({errorTitle,closeCropOnPurchase=false,expectedOutputKey,expectedAccountScope=accountScope}={})=>{
  const heads=outputHeads(state.current),key=heads.map(l=>l.jobId||'missing').join('|');
  const current=()=>outputScopeRef.current===expectedAccountScope&&(expectedOutputKey===undefined||expectedOutputKey===key)&&key===outputHeads(state.current).map(l=>l.jobId||'missing').join('|');
  const changed=()=>{const message='บัญชีหรืองานเปลี่ยนแล้ว กรุณากดบันทึกหรือดาวน์โหลดอีกครั้ง';setStatus(message);if(errorTitle)setSavePopup({state:'error',title:errorTitle,message});return false};
  if(!current())return changed();
  if(state.current.some(l=>l.kind==='source-photo')||!heads.length||heads.some(l=>!l.jobId)){
   const message='กรุณาเพิ่มรูป เลือกทรงผม ปรับแต่งเพื่อดาวน์โหลด';
   setStatus(message);setSavePopup({state:'error',title:'รูปที่ไม่ผ่านการประมวลจากระบบ ไม่สามารถดาวน์โหลดได้',message});return false;
  }
  const results=await Promise.all(heads.map(async l=>{try{return await onVerifyOutput?.(l.jobId)||unavailableOutputRights()}catch{return unavailableOutputRights()}}));
  if(!current())return changed();
  const result=outputAccessResult(results);setVerifiedJobs(previous=>mergeOutputRights(previous,heads.map((l,i)=>[l.jobId,results[i]])));
  if(!result.allowed){setStatus(result.message);if(errorTitle)setSavePopup(result.purchase?null:{state:'error',title:errorTitle,message:result.message});if(result.purchase){if(closeCropOnPurchase)setDownloadCrop(null);onRequestUnlock?.()}return false}
  if(onSelectSuit)try{const suit=state.current.find(l=>layerKind(l)==='suit')?.templatePath,policy=await onSelectSuit(heads[0].jobId,suit?[suit]:[]);if(!current())return changed();setSuitPolicy(policy)}catch(e){setStatus(e.message);return false}
  for(const head of heads)sessionUnlockedJobs.current.add(head.jobId);return true;
 };
 const [suitPolicy,setSuitPolicy]=useState({limited:false,choices:[]}),[suitPolicyError,setSuitPolicyError]=useState('');
 const suitChoiceLimit=suitPolicy.limit===5?5:3;
 const currentSuit=layers.find(l=>layerKind(l)==='suit')?.templatePath||'';
 useEffect(()=>{let cancelled=false;setSuitPolicy({limited:false,choices:[]});setSuitPolicyError('');const head=outputHeads(layers)[0];if(!head||restrictedTrial||!onSelectSuit)return;onSelectSuit(head.jobId,currentSuit?[currentSuit]:[]).then(p=>{if(!cancelled)setSuitPolicy(p)}).catch(e=>{if(!cancelled)setSuitPolicyError(e.message)});return()=>{cancelled=true}},[outputKey,restrictedTrial,currentSuit,onSelectSuit,downloadUnlockSignal]);
 const canUseAllSuits=allOptionsAvailable||hasCredits||trialUnlocked||state.current.some(l=>(layerKind(l)==='head'||l.name==='หัว · คอ · ผม')&&(editableOutputIds.includes(l.jobId)||(verifiedJobs[l.jobId]?.checked!==false&&verifiedJobs[l.jobId]?.unlocked===true&&verifiedJobs[l.jobId]?.fullEdit===true)));
 const paidSessionOutput=outputHeads(layers).length>0&&sessionAllowsOutput(outputHeads(layers));
 const hasDownloadExitRight=outputHeads(layers).length>0&&(hasCredits||savedWorkUnlocked||trialUnlocked||!restrictedTrial||outputHeads(layers).every(l=>paidOutputIds.includes(l.jobId)||sessionUnlockedJobs.current.has(l.jobId)));
 useEffect(()=>{if(!hasDownloadExitRight)return;const warn=e=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[hasDownloadExitRight]);
 const visibleProcessRemaining=typeof processRemaining==='number'&&!hasCredits&&paidSessionOutput?0:processRemaining;
 const canChooseHair=state.current.some(l=>l.name==='หัว · คอ · ผม')||trialUnlocked||hasCredits||(allOptionsAvailable&&!paidSessionOutput);
 const canRestoreHair=(id,mode=hairGender,finish)=>{const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');return !processHairPending&&!state.current.some(l=>l.id===sourceLayerRef.current)&&canReuseHair(id,mode,portraitFinishChoice(finish,head?.femaleEyeStyle,head?.initialFemaleEyeStyle,sourcePhoto?.idpromFemaleEyeStyle))};
 const hasFreeHair=head=>Boolean(head&&(head.freeHairBaseOriginal===true||isFreeFemaleHair(head.hairId)||state.current.some(l=>l.kind==='hair-preview'&&l.hairHeadId===head.id&&isFreeFemaleHair(l.hairId))));
 const freeHairAllowed=head=>Boolean(head?.jobId&&(head.portraitMode||portraitMode)==='female'&&hairGender==='female'&&!processHairPending&&!state.current.some(l=>l.id===sourceLayerRef.current)&&(!head.hairId||head.hairId==='original'||(isFreeFemaleHair(head.hairId)&&head.freeHairBaseOriginal===true&&head.freeHairSourceJobId===head.jobId))&&!state.current.some(l=>l.kind==='hair-preview'&&l.hairHeadId===head.id&&!isFreeFemaleHair(l.hairId))&&(!head.freeHairBaseOriginal||(head.freeHairSourceJobId===head.jobId&&typeof head.hairOriginalSource==='string')));
 const showFreeHairNotice=()=>{setAppearanceError(null);setStatus(FREE_FEMALE_HAIR_MESSAGE);setSavePopup({state:'info',title:'ทรงผมปรับแต่งเอง',message:FREE_FEMALE_HAIR_MESSAGE})};
 const trackUniformSelection=(option,stage,mode)=>analyticsSelection({kind:'uniform',id:option?.id||option?.template?.split('/').pop()?.replace(/\.[^.]+$/,'')||'none',name:option?.title||option?.name||'ไม่เลือกชุด',gender:option?.gender||'unknown',category:option?.cat||'unknown',provider:'uniform',stage,mode,surface:'studio'});
 const trackHairSelection=(id,stage,mode)=>{const option=femaleHair.find(h=>h.id===id)||maleHair.find(h=>h.id===id);if(id&&!option)return;const gender=femaleHair.some(h=>h.id===id)?'female':maleHair.some(h=>h.id===id)?'male':'unknown';analyticsSelection({kind:'hair',id:id||'original',name:option?.name||'ผมเดิม',gender,category:'hair',provider:id?'seedream':'original',stage,mode,surface:'studio'})};
 const trackPhotoType=(mode,stage)=>analyticsSelection({kind:'photo_type',id:mode,name:mode==='female'?'รูปผู้หญิง':'รูปผู้ชาย',gender:mode,category:'photo',provider:'user_choice',stage,mode:'new',surface:'studio'});
 const premiumHairAllowed=outputHeads(layers).some(l=>verifiedJobs[l.jobId]?.premiumHair===true);
 const isPremiumHair=id=>(femaleHair.some(h=>h.id===id)&&!isFreeFemaleHair(id)&&!['seedream-16','seedream-38','seedream-39'].includes(id))||(maleHair.some(h=>h.id===id)&&!['seedream-28','seedream-33','seedream-34'].includes(id));
 const chooseHair=id=>{
  if(processRequestRef.current||processActive||assetBusy){appearanceFailure('hair','กรุณารอการทำงานก่อนหน้าให้เสร็จก่อน');return}
  if(!ready)return;
  if(isPremiumHair(id)&&!premiumHairAllowed){onRequestUnlock?.();return}
  const localHead=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  if(!id&&hairGender==='female'&&localHead?.freeHairBaseOriginal===true){trackHairSelection(id,'select','original');void applyFreeHair(id);return}
  if(!canRestoreHair(id)&&!paidHairAccess&&(trialHairRemaining<=0||!isTrialHairAllowed(id))){onRequestUnlock?.();appearanceFailure('hair','กรุณาตรวจสอบสิทธิ์ก่อนใช้ทรงผมนี้');return}
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  const newSourcePending=state.current.some(l=>l.id===sourceLayerRef.current);
  trackHairSelection(id,'select',id?'new':'original');
  if(processHairPending||newSourcePending||!head){
   if(!sourcePhoto){appearanceFailure('hair','กรุณาเพิ่มรูปต้นฉบับก่อน');return}
   if(!portraitMode){setPortraitChoiceOpen(true);return}
   pendingHairProcessRef.current={hairId:id||'',portraitMode:hairGender};
   void processPhoto({...pendingHairProcessRef.current,continueWithoutSave:true});return;
  }
  void applyHair(id);
 };

 useEffect(()=>{if(processRequestRef.current)return;const head=layers.find(l=>l.name==='หัว · คอ · ผม');if(head?.jobId)window.dispatchEvent(new CustomEvent('idprom-output-job',{detail:{jobId:head.jobId,isTrial:Boolean(head.restrictedTrial&&!paidOutputIds.includes(head.jobId))}}))},[layers,paidOutputIds]);
 const watermarkRef=useRef(null);
 const [watermarkRect,setWatermarkRect]=useState(null);
 useEffect(()=>{if(!restrictedTrial){setWatermarkRect(null);return}const c=canvasRef.current,stage=stageRef.current;if(!c||!stage)return;const update=()=>{const r=c.getBoundingClientRect(),p=stage.getBoundingClientRect();setWatermarkRect({left:r.left-p.left-stage.clientLeft,top:r.top-p.top-stage.clientTop,width:900,height:1200,transformOrigin:'0 0',transform:`scale(${r.width/900},${r.height/1200})`,gridTemplateColumns:'repeat(3,minmax(0,1fr))',gridTemplateRows:'repeat(9,minmax(0,1fr))',gridAutoRows:'auto'})};update();const stopObserving=observeElementResize(update,c,stage);window.addEventListener('resize',update);return()=>{stopObserving();window.removeEventListener('resize',update)}},[restrictedTrial,ready,view,touch,touchOpen,touchMore,picker]);
 const viewFrame=useRef(null),viewTimer=useRef(null);
 const applyView=()=>{viewFrame.current=null;const v=viewRef.current,c=canvasRef.current,o=outlineRef.current;if(!c)return;c.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.zoom})`;if(watermarkRef.current){const r=c.getBoundingClientRect(),p=stageRef.current.getBoundingClientRect();Object.assign(watermarkRef.current.style,{left:(r.left-p.left-stageRef.current.clientLeft)+'px',top:(r.top-p.top-stageRef.current.clientTop)+'px',transform:`scale(${r.width/900},${r.height/1200})`})}if(o){const r=c.getBoundingClientRect(),p=stageRef.current.getBoundingClientRect();Object.assign(o.style,{left:(r.left-p.left)+'px',top:(r.top-p.top)+'px',width:r.width+'px',height:r.height+'px'})}};
 const commitView=()=>{if(viewFrame.current!==null){cancelAnimationFrame(viewFrame.current);applyView()}clearTimeout(viewTimer.current);setView({...viewRef.current})};
 const queueView=next=>{viewRef.current=typeof next==='function'?next(viewRef.current):next;if(viewFrame.current===null)viewFrame.current=requestAnimationFrame(applyView);clearTimeout(viewTimer.current);viewTimer.current=setTimeout(commitView,120)};
 useEffect(()=>{viewRef.current=view;if(viewFrame.current===null)applyView()},[view]);
 useEffect(()=>()=>{if(viewFrame.current!==null)cancelAnimationFrame(viewFrame.current);clearTimeout(viewTimer.current)},[]);
 const current=layers.find(l=>l.id===selected);
 const exitDialogRef=useRef(),exitRequestRef=useRef();
 const initialSaveMarkedRef=useRef(false);
 useEffect(()=>{if(!ready||initialSaveMarkedRef.current)return;initialSaveMarkedRef.current=true;if(savedWorkUnlocked)lastSavedLayersRef.current=state.current},[ready,savedWorkUnlocked]);
 const requestExit=()=>{if(dismissFileSavePanel())return;if(processActive||assetBusy||!ready||savingRef.current||exportingRef.current||accountSaveNotice?.state==='saving')return;if(!hasDownloadExitRight){onClose(snapshot());return}setExitPrompt(true)};
 const requestLogout=()=>{if(hasDownloadExitRight&&!window.confirm('กรุณาดาวน์โหลดรูปลงอุปกรณ์ หากออกจากหน้าจะไม่สามารถเรียกคืนงานเดิมได้'))return;onLogout?.()};
 exitRequestRef.current=requestExit;
 useEffect(()=>{if(!touch)return;const token=uid(),prior=window.history.state,guard={...prior,idpromStudioExit:token};let active=true;window.history.pushState(guard,'');const back=()=>{if(!active)return;window.history.pushState(guard,'');exitRequestRef.current()};window.addEventListener('popstate',back);return()=>{active=false;window.removeEventListener('popstate',back);if(window.history.state?.idpromStudioExit===token)window.history.back()}},[touch]);
 useEffect(()=>{const dialog=exitDialogRef.current;if(exitPrompt&&dialog&&!dialog.open)dialog.showModal();else if(!exitPrompt&&dialog?.open)dialog.close()},[exitPrompt]);

 const snapshot=()=>{
  // Reuse PNG strings only during this synchronous snapshot; edited canvases
  // must be encoded again by the next save, even when their identity is unchanged.
  const encoded=new WeakMap();
  const encodeCanvas=surface=>{if(!encoded.has(surface))encoded.set(surface,surface.toDataURL());return encoded.get(surface)};
  const encode=source=>source instanceof HTMLCanvasElement?encodeCanvas(source):source;
  return state.current.map(l=>{
   const a=assets.current.get(l.id);
   return {...l,source:encode(l.source),processedOriginalSource:encode(l.processedOriginalSource),collarParts:l.collarParts?{left:encode(l.collarParts.left),right:encode(l.collarParts.right)}:l.collarParts,makeupBaseSource:encode(l.makeupBaseSource),makeupFullSource:encode(l.makeupFullSource),mask:a==null?l.mask:encodeCanvas(a.mask)||l.mask,warpSource:a?.warped==null?null:encodeCanvas(a.warped)||null,warpBaseMask:encode(a?.warpBaseMask)||null,eraseRestoreSource:encode(a?.eraseRestoreSource)||null,warpRestoreBase:encode(a?.warpRestoreBase)||null};
  });
 };
 if(purchaseSnapshotRef)purchaseSnapshotRef.current=()=>{flushTransforms();return {layers:snapshot(),placement:placementRef.current,sourcePhoto,originalPreview:compareSourceRef.current}};
 const historyAssets=useRef(new WeakMap());
 const hairStyleMemory=useRef(createHairStyleMemory());
 const youcamHairMemory=useRef(new Map());
 const historySnapshot=()=>{const map=new Map(),next=state.current.map(l=>{
  const a=assets.current.get(l.id);if(!a)return {...l};
  if(!a.historyPixels)a.historyPixels={source:a.directPixelsReady?copySurface(a.original):l.source,mask:copySurface(a.mask),warpSource:copySurface(a.warped),warpBaseMask:a.warpBaseMask,eraseRestoreSource:copySurface(a.eraseRestoreSource),warpRestoreBase:a.warpRestoreBase};
  map.set(l.id,{pixels:a.historyPixels,original:a.directPixelsReady?a.historyPixels.source:a.original,parts:a.parts,thumbnail:a.thumbnail});
  return {...l,...a.historyPixels};
 });historyAssets.current.set(next,map);return next};
 const restoreHistory=next=>{const cached=historyAssets.current.get(next);if(!cached)return false;
  const map=new Map();for(const l of next){const saved=cached.get(l.id);if(!saved)return false;const old=assets.current.get(l.id);
   if(old?.historyPixels===saved.pixels){map.set(l.id,old);continue}
   const p=saved.pixels;map.set(l.id,{original:saved.original,sourceFrame:l.sourceFrame,parts:saved.parts,thumbnail:saved.thumbnail,mask:copySurface(p.mask),warped:copySurface(p.warpSource),warpBaseMask:p.warpBaseMask,eraseRestoreSource:copySurface(p.eraseRestoreSource),warpRestoreBase:p.warpRestoreBase,directPixelsReady:Boolean(p.eraseRestoreSource),pixelSurfaceOwned:false,buffer:canvas(),dirty:true,bounds:null,historyPixels:p});
  }
  assets.current=map;state.current=syncHairAttachments(next.map(l=>({...l})));
  const id=state.current.find(l=>l.id===selectedRef.current)?.id||null;selectedRef.current=id;setSelected(id);setLayers(state.current);setSelectedHair(state.current.find(l=>l.kind==='hair-preview'&&l.hairRole!=='back')?.hairId||state.current.find(l=>layerKind(l)==='head')?.hairId||'');drawNow();return true;
 };
 const resetPhotoHistory=()=>{undo.current=[];redo.current=[];historyAssets.current=new WeakMap();historyTruncatedRef.current=false;historyBoundaryNoticeRef.current=false;setHistoryNotice(null)};
 const remember=e=>{if(e?.type==='pointerdown'&&!isPrimaryEditingPointer(e))return;flushTransforms();undo.current.push(historySnapshot());if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false;}redo.current=[];setRevision(v=>v+1)};
 const deleteLayer=id=>{if(!ready||assetBusy||processActive||comparing||!state.current.some(l=>l.id===id))return;remember();const next=state.current.filter(l=>l.id!==id&&l.hairHeadId!==id);state.current=next;setLayers(next);if(selectedRef.current===id){setSelected(null);setCursor(null);setLayerGuide(false)}setStatus('ลบเลเยอร์แล้ว · กดย้อนกลับเพื่อคืน')};
 const hydratingRef=useRef(false);
 async function hydrate(next,unchangedIds=null){flushTransforms();next=syncHairAttachments(next);if(trialUnlocked)next=next.map(l=>({...l,restrictedTrial:false,outputUnlocked:true}));const token=++loading.current;hydratingRef.current=true;if(!assets.current.size)setReady(false);const map=new Map();try{
  for(const l of next){if((layerKind(l)==='head'||l.name==='หัว · คอ · ผม')&&!l.processedOriginalSource)l.processedOriginalSource=l.hairOriginalSource||l.source;if(unchangedIds?.has(l.id)&&assets.current.has(l.id)){map.set(l.id,assets.current.get(l.id));continue}if(!(l.source instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(l.source))throw Error('โปรเจกต์ต้องใช้ภาพ PNG ในไฟล์');if(layerKind(l)==='suit'&&!l.collarFrame){const p=placementRef.current;l.collarFrame=p?{x:p.uX/p.W*W,y:p.uY/p.H*H,w:p.uW/p.W*W,h:p.uH/p.H*H}:{x:0,y:0,w:W,h:H}}if(l.sourceFrame&&(![l.sourceFrame.x,l.sourceFrame.y,l.sourceFrame.w,l.sourceFrame.h].every(Number.isFinite)||l.sourceFrame.w<=0||l.sourceFrame.h<=0))throw Error('ตำแหน่งภาพต้นทางไม่ถูกต้อง');let original=await image(l.source);if(original.width<1||original.height<1||original.width>(l.collarParts?16384:8192)||original.height>8192)throw Error('ขนาดภาพเลเยอร์ไม่ถูกต้อง');let parts=null;if(l.collarParts||layerKind(l)==='collar'){if(!l.collarParts){const split=splitNativeCollarParts(original,(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}));l.collarParts={left:split.left.toDataURL(),right:split.right.toDataURL()}}parts={};for(const side of ['left','right']){const src=l.collarParts[side];if(!(src instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(src))throw Error('ภาพเข็มปกคอไม่ถูกต้อง');const im=await image(src);if(im.width!==(l.sourceFrame?original.width:W)||im.height!==(l.sourceFrame?original.height:H))throw Error('ขนาดเข็มปกคอไม่ถูกต้อง');parts[side]=im}}if(parts&&!l.warpSource){const f=l.sourceFrame||{x:0,y:0,w:W,h:H};if(f.x>-128||f.y>-128||f.x+f.w<W+128||f.y+f.h<H+128){const nf={x:Math.min(-128,f.x),y:Math.min(-128,f.y),w:0,h:0};nf.w=Math.max(W+128,f.x+f.w)-nf.x;nf.h=Math.max(H+128,f.y+f.h)-nf.y;const density=Math.min(2,original.width/f.w),bw=Math.ceil(nf.w*density),bh=Math.ceil(nf.h*density);const expand=im=>{const c=Object.assign(document.createElement('canvas'),{width:bw,height:bh});c.getContext('2d').drawImage(im,(f.x-nf.x)*bw/nf.w,(f.y-nf.y)*bh/nf.h,f.w*bw/nf.w,f.h*bh/nf.h);return c};original=expand(original);for(const side of ['left','right'])parts[side]=expand(parts[side]);if(l.mask)l.mask=expand(await image(l.mask));l.source=original;l.sourceFrame=nf;l.collarParts={left:parts.left,right:parts.right};for(const key of ['eraseRestoreSource','warpRestoreBase'])if(l[key])l[key]=expand(await image(l[key]));}}const mask=l.sourceFrame?Object.assign(document.createElement('canvas'),{width:original.width,height:original.height}):canvas(),m=mask.getContext('2d');if(l.mask){if(!(l.mask instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(l.mask))throw Error('Mask ไม่ถูกต้อง');m.drawImage(l.mask instanceof HTMLCanvasElement?l.mask:await image(l.mask),0,0,mask.width,mask.height)}else{m.fillStyle='#fff';m.fillRect(0,0,mask.width,mask.height)}let warped=null;if(l.warpSource){if(!(l.warpSource instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(l.warpSource))throw Error('ภาพบิดไม่ถูกต้อง');const im=l.warpSource instanceof HTMLCanvasElement?l.warpSource:await image(l.warpSource);if(im.width<1||im.height<1||im.width>(l.collarParts?16384:8192)||im.height>8192)throw Error('ขนาดภาพบิดไม่ถูกต้อง');warped=Object.assign(document.createElement('canvas'),{width:im.width,height:im.height});warped.getContext('2d').drawImage(im,0,0)}if(l.warpBaseMask&&!(l.warpBaseMask instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(l.warpBaseMask))throw Error('Mask ต้นฉบับไม่ถูกต้อง');let eraseRestoreSource=null,warpRestoreBase=null;for(const key of ['eraseRestoreSource','warpRestoreBase'])if(l[key]){if(!(l[key] instanceof HTMLCanvasElement)&&!/^data:image\/(png|jpeg|webp);base64,/.test(l[key]))throw Error('ภาพอ้างอิงคืนขอบไม่ถูกต้อง');const im=l[key] instanceof HTMLCanvasElement?l[key]:await image(l[key]);if(im.width!==original.width||im.height!==original.height)throw Error('ขนาดภาพอ้างอิงคืนขอบไม่ตรงกับเลเยอร์');const c=copySurface(im);if(key==='eraseRestoreSource')eraseRestoreSource=c;else warpRestoreBase=c}map.set(l.id,{original,sourceFrame:l.sourceFrame,parts,mask,warped,warpBaseMask:l.warpBaseMask||null,eraseRestoreSource,warpRestoreBase,directPixelsReady:Boolean(eraseRestoreSource),buffer:canvas(),dirty:true,bounds:null})}
  if(!mounted.current||token!==loading.current)return false;assets.current=map;state.current=next;setLayers(next);setSelected(next.find(l=>l.id===selectedRef.current)?.id||(touch?null:lastItem(next)?.id)||null);setReady(true);setStatus('');return true;
 }catch(e){if(mounted.current){setReady(assets.current.size>0);setStatus(e.message)}return false}finally{if(token===loading.current)hydratingRef.current=false}}
 useEffect(()=>{mounted.current=true;hydrate(state.current);return()=>{mounted.current=false;++loading.current}},[]);
 useEffect(()=>{if(!ready)return;const ctx=canvasRef.current.getContext('2d');if(comparing&&before.current)paintOriginal(ctx,before.current);else paintScene(ctx,layers,assets.current)},[layers,ready,revision,comparing,compareReady]);
 const getBounds=(a,src)=>{if(!a)return null;const sideImage=a.parts&&(src===a.parts.left||src===a.parts.right);if(sideImage){a.partBounds||=new WeakMap();if(a.partBounds.has(src))return a.partBounds.get(src)}if(a.parts&&(src||a.original)===a.original&&!a.warped){const offsets=(a.partOffsets||'0,0').split(',').map(Number),boxes=['left','right'].map((side,i)=>{const b=getBounds(a,a.parts[side]);return b?{...b,x:b.x+(offsets[i]||0),y:b.y+(offsets[i+2]||0)}:null}).filter(Boolean);if(!boxes.length)return null;const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y}}if(a.bounds&&a.boundsSource===(src||a.original))return a.bounds;const probe=canvas(),ctx=probe.getContext('2d',{willReadFrequently:true});const frame=a.sourceFrame||{x:0,y:0,w:W,h:H};ctx.drawImage(src||a.original,frame.x,frame.y,frame.w,frame.h);const d=ctx.getImageData(0,0,W,H).data;let x=W,y=H,r=-1,b=-1;for(let py=0;py<H;py++)for(let px=0;px<W;px++)if(d[(py*W+px)*4+3]>16){x=Math.min(x,px);y=Math.min(y,py);r=Math.max(r,px);b=Math.max(b,py)}const box=r<0?null:{x,y,w:r-x+1,h:b-y+1};if(sideImage)a.partBounds.set(src,box);else{a.bounds=box;a.boundsSource=src||a.original}return box};
 useEffect(()=>{if(!ready||!touch)return;const next={};for(const l of state.current){const a=assets.current.get(l.id);if(!a)continue;if(!a.thumbnail){const b=getBounds(a,a.original);if(b){const c=document.createElement('canvas');c.width=96;c.height=96;const scale=88/Math.max(b.w,b.h),w=b.w*scale,h=b.h*scale;c.getContext('2d').drawImage(a.original,(b.x-(a.sourceFrame?.x||0))*a.original.width/(a.sourceFrame?.w||W),(b.y-(a.sourceFrame?.y||0))*a.original.height/(a.sourceFrame?.h||H),b.w*a.original.width/(a.sourceFrame?.w||W),b.h*a.original.height/(a.sourceFrame?.h||H),(96-w)/2,(96-h)/2,w,h);a.thumbnail=c.toDataURL()}}next[l.id]=a.thumbnail||l.source}setTouchThumbnails(next)},[touch,ready,revision]);
 useEffect(()=>{if((!touch&&!['move','transform'].includes(tool))||!ready||!current||comparing||!current.visible){setSelectionBoxes([]);return}const a=assets.current.get(current.id);const boxes=a?.parts&&!a.warped?['left','right'].filter(side=>collarSide==='both'||collarSide==='auto'||collarSide===side).map(side=>{const b=getBounds(a,a.parts[side]);return b?{...b,x:b.x+(current[side==='left'?'collarLeftX':'collarRightX']||0),y:b.y+(current[side==='left'?'collarLeftY':'collarRightY']||0)}:null}):[getBounds(a,a?.warped||a?.original)];const visible=boxes.filter(Boolean);if(a?.parts&&visible.length){const x=Math.min(...visible.map(b=>b.x)),y=Math.min(...visible.map(b=>b.y));setSelectionBoxes([{x,y,w:Math.max(...visible.map(b=>b.x+b.w))-x,h:Math.max(...visible.map(b=>b.y+b.h))-y}])}else setSelectionBoxes(visible)},[touch,tool,ready,selected,current?.collarLeftX,current?.collarRightX,current?.collarLeftY,current?.collarRightY,collarSide,revision,comparing,current?.visible]);
 useEffect(()=>{if((!touch&&!['move','transform'].includes(tool))||!ready)return;const stage=stageRef.current,c=canvasRef.current,outline=outlineRef.current;if(!stage||!c||!outline)return;const update=()=>{const r=c.getBoundingClientRect(),p=stage.getBoundingClientRect();setOutlineRatio(r.width/W);Object.assign(outline.style,{left:(r.left-p.left)+'px',top:(r.top-p.top)+'px',width:r.width+'px',height:r.height+'px'})};update();return observeElementResize(update,stage,c)},[touch,tool,ready,view,touchOpen,touchMore,picker]);
 const layerContainsPoint=(l,p,minAlpha=24)=>{
  if(!l||!l.visible||l.opacity<=0||(l.hairHeadId&&!state.current.find(head=>head.id===l.hairHeadId)?.visible))return false;
  const a=assets.current.get(l.id);if(!a)return false;if(a.dirty)drawNow();
  const q=sceneToLayer(l,p),f=l.sourceFrame||{x:0,y:0,w:W,h:H},x=Math.floor((q.x-f.x)*a.buffer.width/f.w),y=Math.floor((q.y-f.y)*a.buffer.height/f.h);
  return x>=0&&x<a.buffer.width&&y>=0&&y<a.buffer.height&&a.buffer.getContext('2d').getImageData(x,y,1,1).data[3]>minAlpha;
 };
 const hitPart=p=>[...state.current].reverse().find(l=>layerKind(l)!=='background'&&layerContainsPoint(l,p))||null;
 const selectCanvasPart=l=>{selectedRef.current=l?.id||null;setSelected(l?.id||null);setTool(l?'move':'pan');setCursor(null);setLayerGuide(false);setTouchLayersOpen(false);setPicker(false);setTouchOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);setStatus('')};
 const scaleAroundCenter=(l,scale)=>{const a=assets.current.get(l.id),b=getBounds(a,a?.warped||a?.original);return b?anchoredTransform(l,{scale},{x:b.x+b.w/2,y:b.y+b.h/2}):{scale}};
 const layerCenter=l=>{const a=assets.current.get(l.id),b=getBounds(a,a?.warped||a?.original);return layerToScene(l,b?{x:b.x+b.w/2,y:b.y+b.h/2}:{x:W/2,y:H/2})};
 const transformFrame=useRef(null),pendingTransforms=useRef(new Map());
 const transformDirty=useRef(false);
 const flushTransforms=(commit=true)=>{if(transformFrame.current!==null)cancelAnimationFrame(transformFrame.current);transformFrame.current=null;if(pendingTransforms.current.size){const pending=new Map(pendingTransforms.current);pendingTransforms.current.clear();state.current=syncHairAttachments(syncHairPairTransforms(state.current,pending));transformDirty.current=true}if(commit){if(transformDirty.current){transformDirty.current=false;setLayers(state.current)}}else{drawNow();const l=state.current.find(l=>l.id===selectedRef.current),g=outlineRef.current?.firstElementChild;if(l&&g)g.setAttribute('transform',`translate(${450+l.x} ${600+l.y}) rotate(${l.rotation}) scale(${layerAxes(l).x} ${layerAxes(l).y}) translate(-450 -600)`)}};
 const queueTransform=(id,patch)=>{pendingTransforms.current.set(id,{...pendingTransforms.current.get(id),...patch});if(transformFrame.current===null)transformFrame.current=requestAnimationFrame(()=>flushTransforms(!gesture.current))};
 useEffect(()=>()=>{if(transformFrame.current!==null)cancelAnimationFrame(transformFrame.current);pendingTransforms.current.clear()},[]);
 const change=(patch,record=true)=>{
  if(!state.current.find(l=>l.id===selectedRef.current&&!l.locked))return;
  if(record){flushTransforms();remember()}
  const base=state.current.find(l=>l.id===selectedRef.current);if(!base||base.locked)return;
  const latest={...base,...pendingTransforms.current.get(base.id)},asset=assets.current.get(base.id),box=getBounds(asset,asset?.warped||asset?.original);let anchored={};
  if(patch.scale!==undefined)anchored=scaleAroundCenter(latest,patch.scale);
  if(box)for(const [key,axis] of [['squeezeX','x'],['squeezeY','y']])if(patch[key]!==undefined)anchored={...anchored,...squeezeTransform({...latest,...anchored},box,axis,patch[key])};
  queueTransform(base.id,{...anchored,...patch});
 };
 const history=async back=>{if(hydratingRef.current||!ready||assetBusy||processActive)return;const from=back?undo.current:redo.current,to=back?redo.current:undo.current;
  if(!from.length){setStatus(back?'ถึงต้นประวัติที่ย้อนกลับได้แล้ว':'ไม่มีขั้นตอนให้ทำซ้ำแล้ว');return}
  const next=lastItem(from);
  // Warn once, before the final retained step, only when older history was lost.
  if(back&&from.length===1&&historyTruncatedRef.current&& !historyBoundaryNoticeRef.current){historyBoundaryNoticeRef.current=true;setHistoryNotice({kind:'boundary',pendingBack:true,message:'กรุณาบันทึกงาน หากกดย้อนกลับต่อ จะไม่สามารถเรียกคืนประวัติเก่าได้'});return}
  flushTransforms();const saved=historySnapshot();if(restoreHistory(next)||await hydrate(next)){from.pop();to.push(saved);setRevision(v=>v+1);setStatus(back?'ย้อนกลับแล้ว':'ทำซ้ำแล้ว')}
 };
 const point=e=>{const r=canvasRef.current.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H}};
 const outsideImage=e=>{const r=canvasRef.current.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom};
 const local=p=>sceneToLayer(state.current.find(l=>l.id===selectedRef.current),p);
 const paintFrame=useRef(null),pendingBrushRegion=useRef(null);
 const drawNow=()=>{if(paintFrame.current!==null)cancelAnimationFrame(paintFrame.current);paintFrame.current=null;if(canvasRef.current){const ctx=canvasRef.current.getContext('2d'),damage=pendingBrushRegion.current;pendingBrushRegion.current=null;paintScene(ctx,state.current,assets.current,gesture.current?.layer?.id,damage);canvasRef.current.dispatchEvent(new Event('studio-paint'))}};
 const schedulePaint=()=>{if(paintFrame.current===null)paintFrame.current=requestAnimationFrame(drawNow)};
 useEffect(()=>()=>{if(paintFrame.current!==null)cancelAnimationFrame(paintFrame.current)},[]);
 const flushPixelStroke=()=>{const g=gesture.current;if(!g?.pixelStroke)return;const region=g.pixelStroke.flush();if(!region)return;const a=assets.current.get(g.layer.id),l=state.current.find(l=>l.id===g.layer.id);a.historyPixels=null;a.bounds=null;if(l.neckWidth||l.neckHeight)a.collarSource=null;let nativeRegion=region;if(g.legacyMaskStroke){const src=a.collarRendered||a.warped||a.original,x=Math.max(0,Math.floor(region.x*src.width/g.pixelSurface.width)-2),y=Math.max(0,Math.floor(region.y*src.height/g.pixelSurface.height)-2);nativeRegion={x,y,w:Math.min(src.width,Math.ceil((region.x+region.w)*src.width/g.pixelSurface.width)+2)-x,h:Math.min(src.height,Math.ceil((region.y+region.h)*src.height/g.pixelSurface.height)+2)-y}}dirtyRegion(a,nativeRegion);const damage=brushSceneRegion(region,l,g.pixelSurface,canvasRef.current);if(!pendingBrushRegion.current)pendingBrushRegion.current=damage;else{const r=pendingBrushRegion.current,x=Math.min(r.x,damage.x),y=Math.min(r.y,damage.y);pendingBrushRegion.current={x,y,w:Math.max(r.x+r.w,damage.x+damage.w)-x,h:Math.max(r.y+r.h,damage.y+damage.h)-y}}schedulePaint()};
 const stamp=p=>{const g=gesture.current,l=state.current.find(l=>l.id===selectedRef.current);if(!g||!l||l.locked)return;const a=assets.current.get(l.id);
  if(!g.pixelStroke){g.pixelLayerSourceBackup=lastItem(undo.current)?.find(v=>v.id===l.id)?.source||l.source;g.pixelOriginalBackup=a.directPixelsReady?(lastItem(undo.current)?.find(v=>v.id===l.id)?.source||a.original):a.original;g.pixelRestoreBackup=copySurface(a.eraseRestoreSource);g.pixelReadyBackup=a.directPixelsReady;g.warpBackup=lastItem(undo.current)?.find(v=>v.id===l.id)?.warpSource||null;
   // YouCam keeps editable masks; other ordinary layers retain direct pixel erasing.
   // Suit/collar offsets keep their existing mask coordinates.
   let prepared;if(g.kind==='paint'){if(a.parts&&!a.warped){a.warped=copySurface(a.original);a.warpBaseMask=copySurface(a.mask);a.warpRestoreBase=copySurface(a.eraseRestoreSource)}prepared=preparePixelSurface(a,l,copySurface);}else if(l.youcamHairMask||l.youcamNativeHead){if(!a.eraseRestoreSource){if(l.youcamHairMask)throw Error('ไม่พบขอบเขตคืนผม · เก็บภาพเดิมไว้');a.eraseRestoreSource=copySurface(a.warped||a.original);l.eraseRestoreSource=a.eraseRestoreSource}g.legacyMaskStroke=true;prepared={surface:a.mask,reference:a.eraseRestoreSource}}else if(a.parts||layerKind(l)==='suit'){g.legacyMaskStroke=true;const reference=copySurface(a.mask),m=reference.getContext('2d');m.clearRect(0,0,reference.width,reference.height);m.fillStyle='#fff';m.fillRect(0,0,reference.width,reference.height);prepared={surface:a.mask,reference}}else prepared=preparePixelSurface(a,l,copySurface);const radius=brush/2/layerAxes(l).x*(l.sourceFrame?Math.max(prepared.surface.width/l.sourceFrame.w,prepared.surface.height/l.sourceFrame.h):prepared.surface.width/W);g.pixelSurface=prepared.surface;g.pixelStroke=pixelEraserStroke(prepared.surface,prepared.reference,{radius,radiusY:radius*layerAxes(l).x/layerAxes(l).y,softness:soft,opacity:g.kind==='paint'?paintOpacity/100:g.kind==='erase'?eraseOpacity/100:1,color:g.kind==='paint'?[1,3,5].map(i=>parseInt(paintColor.slice(i,i+2),16)):null,restore:g.kind==='restore',stabilize:.15});
  }
  const q=local(p),f=l.sourceFrame||{x:0,y:0,w:W,h:H};g.pixelStroke.add({x:(q.x-f.x)*g.pixelSurface.width/f.w,y:(q.y-f.y)*g.pixelSurface.height/f.h});
 };
 const warp=(p,last)=>{
  const l=state.current.find(l=>l.id===selectedRef.current);if(!l||l.locked||!l.visible)return;
  // Warp only the selected layer, without switching its hair partner.
  if(gesture.current?.layer?.id&&gesture.current.layer.id!==l.id)return;
  const a=assets.current.get(l.id);if(!a.warped){a.warped=Object.assign(document.createElement('canvas'),{width:a.original.width,height:a.original.height});a.warped.getContext('2d').drawImage(a.original,0,0);a.warpBaseMask=copySurface(a.mask);a.warpRestoreBase=copySurface(a.eraseRestoreSource)}
  const end=local(p),start=last?local(last):end,radius=warpSize/2/l.scale,dist=Math.hypot(end.x-start.x,end.y-start.y);
  if(warpMode==='push'&&!dist)return;
  const steps=Math.min(32,Math.max(1,Math.ceil(dist/Math.max(2,radius*.2))));
  for(let i=1;i<=steps;i++){const region=liquifyCanvas(a.warped,a.mask,{x:start.x+(end.x-start.x)*i/steps,y:start.y+(end.y-start.y)*i/steps},radius,{x:(end.x-start.x)/steps,y:(end.y-start.y)/steps},warpMode,warpStrength/100,l.sourceFrame,true);if(region)dirtyRegion(a,region);if(a.eraseRestoreSource)liquifyCanvas(a.eraseRestoreSource,null,{x:start.x+(end.x-start.x)*i/steps,y:start.y+(end.y-start.y)*i/steps},radius,{x:(end.x-start.x)/steps,y:(end.y-start.y)/steps},warpMode,warpStrength/100,l.sourceFrame,true)}
  invalidateCollarSource(a.warped);a.historyPixels=null;a.bounds=null;if(l.neckWidth||l.neckHeight)a.collarSource=null;schedulePaint();
 };
 const resetWarp=async()=>{if(!current||current.locked||!ready||assetBusy)return;const previous=historySnapshot(),next=previous.map(l=>l.id===selected?{...l,warpSource:null,mask:l.warpBaseMask||l.mask,warpBaseMask:null,eraseRestoreSource:l.warpRestoreBase||null,warpRestoreBase:null}:l);if(await hydrate(next)){undo.current.push(previous);redo.current=[];setRevision(v=>v+1);setStatus('คืนรูปก่อนบิดแล้ว')}};
 const brushTool=['warp','erase','restore','paint'].includes(tool),brushDiameter=tool==='warp'?warpSize:brush;
 const cursorRef=useRef(null);
 const updateCursor=e=>{if(!brushTool||comparing||processActive||assetBusy||brushSession.current?.awaitingLayer||['pan','pinch','pinch-tail'].includes(gesture.current?.kind)||pointers.current.size>1){setCursor(null);return}const stage=e.currentTarget.getBoundingClientRect(),r=canvasRef.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){setCursor(null);return}brushPreviewActive.current=true;const next={x:e.clientX-stage.left,y:e.clientY-stage.top,size:brushDiameter*r.width/W};if(cursorRef.current)Object.assign(cursorRef.current.style,{left:next.x+'px',top:next.y+'px',width:next.size+'px',height:next.size+'px'});else setCursor(next)};
 useEffect(()=>{if(!ready||!brushTool||comparing||processActive||assetBusy){setCursor(null);return}const stage=stageRef.current,c=canvasRef.current;if(!stage||!c)return;brushPreviewActive.current=true;const preview=()=>{if(!brushPreviewActive.current)return;const r=c.getBoundingClientRect(),p=stage.getBoundingClientRect();setCursor({x:r.left-p.left+r.width/2,y:r.top-p.top+r.height/2,size:brushDiameter*r.width/W})};preview();return observeElementResize(preview,stage,c)},[ready,tool,brushDiameter,view,touchOpen,touchMore,picker,comparing,processActive,assetBusy]);

 useEffect(()=>{if(!brushTool)return;const outside=e=>{const r=canvasRef.current?.getBoundingClientRect();if(!r||e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){brushPreviewActive.current=false;setCursor(null)}};document.addEventListener('pointermove',outside);return()=>document.removeEventListener('pointermove',outside)},[brushTool]);

 const warpFrame=useRef(null),pendingWarp=useRef(null);
 const cancelWarpFrame=()=>{if(warpFrame.current!==null)cancelAnimationFrame(warpFrame.current);warpFrame.current=null;pendingWarp.current=null};
 const flushWarpFrame=()=>{if(warpFrame.current!==null)cancelAnimationFrame(warpFrame.current);warpFrame.current=null;const pending=pendingWarp.current;pendingWarp.current=null;if(pending&&gesture.current===pending.g&&pointers.current.size===1){if(pending.g.kind==='warp'){warp(pending.p,pending.g.last);pending.g.last=pending.p}else{for(const p of pending.points){stamp(p);pending.g.last=p}flushPixelStroke()}drawNow()}};
 const queueWarp=p=>{const g=gesture.current;if(g?.kind==='warp')pendingWarp.current={p,g};else if(pendingWarp.current?.g===g){const last=lastItem(pendingWarp.current.points);if(last.x!==p.x||last.y!==p.y)pendingWarp.current.points.push(p)}else pendingWarp.current={g,points:[p]};if(warpFrame.current===null)warpFrame.current=requestAnimationFrame(flushWarpFrame)};
 useEffect(()=>()=>cancelWarpFrame(),[]);
 const down=e=>{if(!isPrimaryEditingPointer(e))return;if(hydratingRef.current||assetBusy||processActive||(e.pointerType==='touch'&&penPointerRef.current!==null))return;if(touch&&touchLayersOpen){setTouchLayersOpen(false)}if(picker){setPicker(false)}if(touch&&(touchOpen||touchMore)){e.preventDefault();setTouchOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);setCursor(null);}if(!ready||comparing)return;if(e.pointerType==='pen')penPointerRef.current=e.pointerId;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===2){flushTransforms();cancelWarpFrame();const old=gesture.current;if(old?.layer){if(old.backup){const a=assets.current.get(old.layer.id);a.mask.getContext('2d').clearRect(0,0,a.mask.width,a.mask.height);a.mask.getContext('2d').drawImage(old.backup,0,0);if(old.kind==='warp'){a.warped=old.warpBackup;a.warpBaseMask=old.warpBaseMask}if(old.pixelStroke){a.original=old.pixelOriginalBackup;a.pixelSurfaceOwned=false;old.layer.source=old.pixelLayerSourceBackup;old.layer.eraseRestoreSource=old.pixelRestoreBackup||null;a.eraseRestoreSource=old.pixelRestoreBackup;a.directPixelsReady=old.pixelReadyBackup;a.warped=copySurface(old.warpBackup);pendingBrushRegion.current=null}else if(old.kind==='warp'){a.eraseRestoreSource=copySurface(lastItem(undo.current)?.find(l=>l.id===old.layer.id)?.eraseRestoreSource)}a.dirty=true;a.dirtyRect=null;a.historyPixels=null;a.collarSource=null;a.bounds=null}state.current=state.current.map(l=>l.id===old.layer.id?old.layer:l);setLayers(ls=>ls.map(l=>l.id===old.layer.id?old.layer:l));if(!['touch-select','tool-press'].includes(old.kind))undo.current.pop();setRevision(v=>v+1)}const [a,b]=[...pointers.current.values()];gesture.current={kind:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,view:{...viewRef.current}};return}if(pointers.current.size>2)return;const p=point(e);
  if(outsideImage(e)){if(!brushSession.current)selectCanvasPart(null);gesture.current={kind:'pan',x:e.clientX,y:e.clientY,view:{...viewRef.current}};return}
  if(brushSession.current){
   const session=brushSession.current,l=state.current.find(l=>l.id===session.layerId);
   if(session.awaitingLayer||!l){session.awaitingLayer=true;setBrushLayerRequired(true);setLayerGuide(true);setTouchLayersOpen(touch);setStatus('');return}
   selectedRef.current=l.id;setSelected(l.id);setTool(session.tool);gesture.current={kind:'tool-press',brushKind:session.tool,start:p,last:p,clientX:e.clientX,clientY:e.clientY,layer:{...l}};beginToolStroke(gesture.current);return;
  }
  if(['move','transform','pan','neck'].includes(tool)||!current){const hit=hitPart(p);selectCanvasPart(hit);let pinSide=null;const pinAsset=hit&&assets.current.get(hit.id);if(pinAsset?.parts&&!pinAsset.warped){const q=sceneToLayer(hit,p);pinSide=['left','right'].find(side=>{const b=getBounds(pinAsset,pinAsset.parts[side]);const dx=hit[side==='left'?'collarLeftX':'collarRightX']||0,dy=hit[side==='left'?'collarLeftY':'collarRightY']||0;return b&&q.x>=b.x+dx&&q.x<=b.x+b.w+dx&&q.y>=b.y+dy&&q.y<=b.y+b.h+dy})||null;if(collarSide==='both')pinSide=null;else if(pinSide)setCollarSide(pinSide)}gesture.current=hit?{kind:'touch-select',pinSide,start:p,clientX:e.clientX,clientY:e.clientY,pointerType:e.pointerType,layer:{...hit}}:{kind:'pan',x:e.clientX,y:e.clientY,view:{...viewRef.current}};return}
  // A tap selects. A drag keeps the explicitly chosen brush and its layer.
  gesture.current={kind:'tool-press',brushKind:tool,start:p,last:p,clientX:e.clientX,clientY:e.clientY,layer:{...current}};
 };
 const beginToolStroke=g=>{if(!g.layer||g.layer.locked||!g.layer.visible||(g.brushKind==='erase'&&eraseOpacity===0)||(g.brushKind==='paint'&&paintOpacity===0))return false;
  remember();g.kind=g.brushKind;const saved=lastItem(undo.current)?.find(l=>l.id===g.layer.id);g.backup=saved?.mask;
  if(g.kind==='warp'){const a=assets.current.get(g.layer.id);g.warpBaseMask=a.warpBaseMask;g.warpBackup=saved?.warpSource||null;warp(g.start)}else{stamp(g.start);flushPixelStroke()}return true;
 };

 const move=e=>{if(hasSecondaryPointerButton(e))return;if(e.pointerType==='touch'&&penPointerRef.current!==null)return;updateCursor(e);if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g||g.kind==='pinch-tail')return;if(g.kind==='pinch'&&pointers.current.size>=2){const[a,b]=[...pointers.current.values()];queueView({zoom:Math.max(.3,Math.min(5,g.view.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance))),x:g.view.x+(a.x+b.x)/2-g.cx,y:g.view.y+(a.y+b.y)/2-g.cy});return}if(g.kind==='pan'){queueView({...g.view,x:g.view.x+e.clientX-g.x,y:g.view.y+e.clientY-g.y});return}const p=point(e);if(g.kind==='tool-press'){if(Math.hypot(e.clientX-g.clientX,e.clientY-g.clientY)<3)return;if(!beginToolStroke(g))return}if(g.kind==='touch-dismiss'||g.kind==='touch-panel-dismiss')return;if(g.kind==='touch-select'){if(Math.hypot(e.clientX-g.clientX,e.clientY-g.clientY)<(g.pointerType==='pen'?1:8))return;g.tapMoved=true;if(!g.layer||g.layer.locked||!g.layer.visible)return;remember();g.kind='move'}if(g.kind==='shape-squeeze-x'||g.kind==='shape-squeeze-y'){queueTransform(g.layer.id,squeezePointer(g.layer,g.box,g.kind==='shape-squeeze-x'?'x':'y',g.side,g.start,p))}else if(g.kind==='shape-scale'||g.kind==='shape-rotate'){const center=g.kind==='shape-scale'?g.center:{x:W/2+g.layer.x,y:H/2+g.layer.y};const value=g.kind==='shape-scale'?scaleAroundCenter(g.layer,Math.max(.1,Math.min(3,g.layer.scale*Math.hypot(p.x-center.x,p.y-center.y)/g.distance))):{rotation:Math.max(-180,Math.min(180,g.layer.rotation+(Math.atan2(p.y-center.y,p.x-center.x)-g.angle)*180/Math.PI))};queueTransform(g.layer.id,value)}else if(g.kind==='move'){if(g.pinSide){const a=sceneToLayer(g.layer,g.start),b=sceneToLayer(g.layer,p),x=g.pinSide==='left'?'collarLeftX':'collarRightX',y=g.pinSide==='left'?'collarLeftY':'collarRightY';queueTransform(g.layer.id,{[x]:(g.layer[x]||0)+b.x-a.x,[y]:(g.layer[y]||0)+b.y-a.y})}else queueTransform(g.layer.id,{x:g.layer.x+p.x-g.start.x,y:g.layer.y+p.y-g.start.y})}else if(g.kind==='erase'||g.kind==='restore'||g.kind==='paint'){const samples=e.nativeEvent?.getCoalescedEvents?.()||[];for(const sample of samples)queueWarp(point(sample));queueWarp(p)}else if(g.kind==='warp'){queueWarp(p)}};
 const startShape=(e,kind,box=null,side='center')=>{if(!isPrimaryEditingPointer(e))return;e.stopPropagation();e.preventDefault();if(hydratingRef.current||!ready||assetBusy||processActive||comparing||!current||current.locked||!current.visible)return;if(e.pointerType==='touch'&&penPointerRef.current!==null)return;if(e.pointerType==='pen')penPointerRef.current=e.pointerId;if(pointers.current.size){down(e);return}stageRef.current.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=point(e),center=kind==='shape-scale'?layerCenter(current):{x:W/2+current.x,y:H/2+current.y},dx=p.x-center.x,dy=p.y-center.y;remember();gesture.current={kind,box,side,start:p,last:p,layer:{...current},center,distance:Math.max(1,Math.hypot(dx,dy)),angle:Math.atan2(dy,dx)}};
 const end=e=>{
  if(!pointers.current.has(e.pointerId))return;
  // Lost capture can interrupt a pen without pointerup; release its touch guard too.
  const cancelled=e.type==='pointercancel'||e.type==='lostpointercapture'||hasSecondaryPointerButton(e);
  commitView();flushTransforms();
  if(['warp','erase','restore','paint'].includes(gesture.current?.kind)){if(cancelled)cancelWarpFrame();else{flushWarpFrame();const g=gesture.current;if(g?.pixelStroke){stamp(point(e));g.pixelStroke.finish();flushPixelStroke()}}}
  if(penPointerRef.current===e.pointerId)penPointerRef.current=null;
  if(gesture.current?.kind==='tool-press'&&!brushSession.current&&!cancelled)selectCanvasPart(hitPart(point(e)));
  const tap=gesture.current;
  if(touch&&tap?.kind==='touch-select'&&!tap.tapMoved&&!cancelled&&Math.hypot(e.clientX-tap.clientX,e.clientY-tap.clientY)<(tap.pointerType==='pen'?1:8)){
   setTouchOpen(true);setTouchMore(false);setTouchSide('both');setToolRailOpen(false);
  }
  if(touch&&gesture.current?.kind==='touch-panel-dismiss'&&!cancelled){setTouchOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);setCursor(null)}
  if(touch&&gesture.current?.kind==='touch-dismiss'&&!cancelled)clearTouchSelection();
  drawNow();pointers.current.delete(e.pointerId);
  if(gesture.current?.kind==='pinch'&&pointers.current.size){gesture.current={kind:'pinch-tail'};return}
  gesture.current=null;setLayers([...state.current]);setRevision(v=>v+1)
 };
 const download=(blob,name)=>deliverImage(blob,name);
 const save=async(options={})=>{
  if(!onSaveWork){setStatus('บัญชีใหม่ไม่รองรับบันทึกงาน กรุณาดาวน์โหลดรูปก่อนออก');return false}
  if(!options.background&&!options.exitAfter&&savingRef.current){setStatus('กำลังบันทึกงาน กรุณารอสักครู่');return false}
  const saveSequence=options.saveSequence??++saveSequenceRef.current;
  // A delayed image encoder must not overwrite a newer save or export.
  const staleBackground=()=>options.background&&saveSequence!==saveSequenceRef.current;
  if(staleBackground())return false;
  if((options.background||options.exitAfter)&&savingRef.current)await savingDoneRef.current;
  if(staleBackground())return false;
  if(savingRef.current){setStatus('กำลังบันทึกงาน กรุณารอสักครู่');return false}
  lastSaveErrorRef.current=null;let savedLayers=state.current;
  let finishSaving;const showPopup=options.showPopup!==false;savingRef.current=true;savingDoneRef.current=new Promise(resolve=>{finishSaving=resolve});
  if(showPopup)setSavePopup({state:'saving',title:'บันทึกงานไว้แก้ไขต่อ',message:'กำลังบันทึกในบัญชีของคุณ กรุณารอผลยืนยันก่อนออกจากเว็บ · บันทึกได้สูงสุด 3 งาน'});
  try{
   if(!options.outputVerified&&!(await allowOutput({errorTitle:showPopup?'บันทึกงานไม่สำเร็จ':null}))){setHistoryNotice(null);return false}
   flushTransforms();savedLayers=options.project?options.project.layers:state.current;const project=await makeSavedProject(options.project?{...options.project,layers:options.project.layers.map(l=>({...l,source:surfaceURL(l.source),processedOriginalSource:surfaceURL(l.processedOriginalSource),collarParts:l.collarParts?{left:surfaceURL(l.collarParts.left),right:surfaceURL(l.collarParts.right)}:l.collarParts,makeupBaseSource:surfaceURL(l.makeupBaseSource),makeupFullSource:surfaceURL(l.makeupFullSource),mask:surfaceURL(l.mask),warpSource:surfaceURL(l.warpSource),warpBaseMask:surfaceURL(l.warpBaseMask),eraseRestoreSource:surfaceURL(l.eraseRestoreSource),warpRestoreBase:surfaceURL(l.warpRestoreBase)}))}:{placement:placementRef.current,compareSource:compareSourceRef.current,sourcePhoto,layers:snapshot()});
   if(outputScopeRef.current!==accountScope)throw Error('บัญชีเปลี่ยนแล้ว กรุณาบันทึกงานอีกครั้ง');
   if(staleBackground())return false;
   let message;if(onSaveWork&&!trialUnlocked){setStatus('กำลังบันทึกงานไว้ในบัญชี…');await onSaveWork(project,{auto:options.auto===true,workScope:options.workScope,createCopy:options.createCopy===true,...(options.workId!==undefined?{workId:options.workId}:{})});if(state.current===savedLayers)lastSavedLayersRef.current=savedLayers;message='บันทึกงานในบัญชีสำเร็จแล้ว · เปิดแก้ไขจากงานของฉันด้วยอีเมลเดิมได้ หากต้องการไฟล์รูปในเครื่อง ให้กดดาวน์โหลดรูปด้วย'}else{const delivery=download(new Blob([JSON.stringify(project)],{type:'application/json'}),'IDPROM-Studio.idstudio');message=delivery==='panel'?'ไฟล์โปรเจกต์พร้อมแล้ว · เลือกบันทึกหรือแชร์ไฟล์':'ส่งคำขอดาวน์โหลดไฟล์โปรเจกต์แล้ว'}
   setStatus(message);if(showPopup)setSavePopup({state:'success',message,exitAfter:options.exitAfter===true});return true;
  }catch(e){lastSaveErrorRef.current=e;const message=options.auto?'สร้างรูปสำเร็จแล้ว แต่ยังบันทึกงานไม่ได้: '+(e.message||'กรุณาลองใหม่')+' กรุณาดาวน์โหลดเก็บไว้ก่อนออกจากเว็บ':options.background?'ดาวน์โหลดรูปแล้ว แต่บันทึกงานไม่สำเร็จ กรุณากดบันทึกอีกครั้ง':e.message||'บันทึกงานไม่สำเร็จ กรุณาลองใหม่';setStatus(message);if(showPopup)setSavePopup({state:'error',message});return false}
  finally{savingRef.current=false;finishSaving?.()}
 };
 const reportProcessedResult=()=>{setStatus('สร้างรูปสำเร็จแล้ว')};
 const retryReceiptSave=async()=>{
  if(!processReceipt?.canSave||savingRef.current)return;
  const request=processReceipt.request;setProcessReceipt(current=>({...current,saveState:'saving'}));
  const ok=await save({auto:true,showPopup:false,background:true});
  const error=lastSaveErrorRef.current;
  if(mounted.current)setProcessReceipt(current=>current?.request===request?{...current,saveState:ok?'saved':'error',limitReached:error?.code==='saved_work_limit',message:error?.message||'ยังบันทึกงานไม่สำเร็จ กรุณาดาวน์โหลดเก็บไว้ก่อนออกจากเว็บ'}:current);
 };
 const load=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>80*1024*1024)throw Error('ไฟล์ใหญ่เกิน 80 MB');const data=JSON.parse(await file.text());if(onOpenProject){await onOpenProject(data);return}await prepareSavedProject(data,{decode:image});if(data.format!=='idprom-studio'||data.version!==1||data.width!==W||data.height!==H||!Array.isArray(data.layers)||!data.layers.length||data.layers.length>20)throw Error('รูปแบบโปรเจกต์ไม่ถูกต้อง');const next=data.layers.map(l=>{if(typeof l.name!=='string'||typeof l.source!=='string'||![l.x,l.y,l.scale,l.rotation,l.opacity].every(Number.isFinite)||l.scale<.1||l.scale>5||l.opacity<0||l.opacity>1||['squeezeX','squeezeY'].some(k=>l[k]!==undefined&&(!Number.isFinite(l[k])||l[k]<.1||l[k]>3)))throw Error('ข้อมูลเลเยอร์ไม่ถูกต้อง');return {...l,visible:!!l.visible,locked:!!l.locked}});const remapped=freshLinkedLayers(next);next.splice(0,next.length,...remapped);let original=null;if(data.compareSource){if(!/^data:image\/(png|jpeg|webp);base64,/.test(data.compareSource))throw Error('รูปต้นฉบับไม่ถูกต้อง');original=await image(data.compareSource);if(original.width>8192||original.height>8192)throw Error('รูปต้นฉบับใหญ่เกินไป')}const previous=historySnapshot();if(await hydrate(next)){compareSourceRef.current=data.compareSource||null;before.current=original;setCompareReady(Boolean(original));setComparing(false);if(data.placement&&['W','H','uX','uY','uW','uH'].every(k=>Number.isFinite(data.placement[k]))&&data.placement.W>0&&data.placement.H>0)placementRef.current=data.placement;undo.current.push(previous);redo.current=[];setRevision(v=>v+1)}}catch(err){setStatus(err.message)}};
 const exportImage=async (type,{automatic=false}={})=>{
  if(exportingRef.current){setStatus('กำลังเตรียมไฟล์ภาพ กรุณารอสักครู่');return}
  exportingRef.current=true;
  const saveSequence=++saveSequenceRef.current;
  let c,b;
  setSavePopup({state:'saving',title:'กำลังเตรียมดาวน์โหลด',message:'กำลังเตรียมไฟล์ภาพ กรุณารอสักครู่'});
  try{
   if(automatic&&!(await allowOutput({errorTitle:'ดาวน์โหลดไม่สำเร็จ'})))return;flushTransforms();const renderedOutputKey=outputHeads(state.current).map(l=>l.jobId||'missing').join('|');c=nativeCanvas(placementRef.current);if(type==='image/jpeg'){b=nativeCanvas(placementRef.current);paintScene(b.getContext('2d'),state.current,assets.current);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(b,0,0);b.width=1;b.height=1}else paintScene(c.getContext('2d'),state.current,assets.current);
   const workId=onSaveWork?.currentWorkId?.(),workScope=onSaveWork?.currentScope?.();let project=null,backupError=null;
   // Capture the original file with these pixels: its work ID carries the
   // existing paid unlock across saved-work reopen and hairstyle changes.
   // An optional account backup must not prevent delivery of the painted image.
   if(onSaveWork&&!trialUnlocked)try{project={format:'idprom-studio',version:1,width:W,height:H,placement:{...placementRef.current},compareSource:compareSourceRef.current,sourcePhoto,layers:historySnapshot()}}catch(error){backupError=error}
   const blob=await withDeadline(()=>new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(blob):reject(Error('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่')),'image/png')),{timeoutMs:30000,message:'เตรียมไฟล์ภาพใช้เวลานาน กรุณาลองอีกครั้ง',code:'STUDIO_EXPORT_TIMEOUT'});
   if(outputScopeRef.current!==accountScope||renderedOutputKey!==outputHeads(state.current).map(l=>l.jobId||'missing').join('|'))throw Error('บัญชีหรืองานเปลี่ยนแล้ว กรุณาดาวน์โหลดอีกครั้ง');
   setSavePopup(null);if(automatic){download(blob,'IDPROM-Studio-original.png');setStatus('ปลดล็อกแล้ว · ส่งคำขอดาวน์โหลดขนาดเดิม หากยังไม่ได้ไฟล์ให้กดดาวน์โหลดอีกครั้ง');return}setDownloadCrop({blob,type,project,workId,workScope,saveSequence,backupError,renderedOutputKey,accountScope});
  }catch(e){const message=e.message||'ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่';setStatus(message);setSavePopup({state:'error',title:'ดาวน์โหลดไม่สำเร็จ',message})}
  finally{exportingRef.current=false;for(const surface of [c,b])if(surface){surface.width=1;surface.height=1}}
 };
 const autoDownloadAttempted=useRef(new Set());
 useEffect(()=>{
  const signal=downloadUnlockSignal;if(!signal||autoDownloadAttempted.current.has(signal.id)||!ready)return;
  if(!outputHeads(state.current).some(l=>l.jobId===signal.jobId))return;
  autoDownloadAttempted.current.add(signal.id);void exportImage('image/png',{automatic:true});
 },[downloadUnlockSignal,ready,outputKey]);
 const finishDownloadCrop=async crop=>{
  if(exportingRef.current||!downloadCrop)return;
  exportingRef.current=true;setDownloadCropBusy(true);
  const {blob,type,project,workId,workScope,saveSequence,backupError,renderedOutputKey,accountScope:renderedAccountScope}=downloadCrop;
  try{
   if(!(await allowOutput({errorTitle:'ดาวน์โหลดไม่สำเร็จ',closeCropOnPurchase:true,expectedOutputKey:renderedOutputKey,expectedAccountScope:renderedAccountScope})))return;
   let output=await withDeadline(()=>cropPhotoForDownload(blob,crop,{pixelScale:2,type}),{timeoutMs:30000,message:'เตรียมไฟล์ภาพใช้เวลานาน กรุณาลองอีกครั้ง',code:'STUDIO_CROP_TIMEOUT'});
   if(type==='image/jpeg'&&crop.sizeId==='original'){
    const url=URL.createObjectURL(blob);let im;try{im=await image(url)}finally{URL.revokeObjectURL(url)}
    const c=nativeCanvas();c.getContext('2d').drawImage(im,0,0);
    try{output=await withDeadline(()=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('เตรียม JPG ไม่สำเร็จ')),type,.97)),{timeoutMs:30000,message:'เตรียม JPG ใช้เวลานาน กรุณาลองอีกครั้ง'})}finally{c.width=1;c.height=1}
   }
   if(outputScopeRef.current!==renderedAccountScope||renderedOutputKey!==outputHeads(state.current).map(l=>l.jobId||'missing').join('|'))throw Error('บัญชีหรืองานเปลี่ยนแล้ว กรุณาดาวน์โหลดอีกครั้ง');
   const size=STUDIO_DOWNLOAD_SIZES.find(s=>s.id===crop.sizeId),width=size?.width?Math.round(size.width/25.4*300)*2:2256,height=size?.height?Math.round(size.height/25.4*300)*2:3072;
   const delivery=download(output,'IDPROM-Studio'+(size?.width?'-'+size.id:'')+(type==='image/jpeg'?'.jpg':'.png'));
   setDownloadCrop(null);setStatus(delivery==='panel'?'รูปพร้อมแล้ว · เลือกบันทึกหรือแชร์รูป':`ส่งคำขอดาวน์โหลดภาพ ${width} × ${height} แล้ว`);
   if(backupError)setSavePopup({state:'error',title:'รูปพร้อมแล้ว แต่ยังสำรองงานไม่สำเร็จ',message:'บันทึกรูปได้ตามปกติ แต่งานยังไม่ถูกสำรองเข้าบัญชี กรุณากดบันทึกงานอีกครั้ง รูปและเลเยอร์เดิมยังอยู่'});
   if(project&&saveSequence===saveSequenceRef.current)setTimeout(()=>{downloadSaveQueueRef.current=downloadSaveQueueRef.current.then(()=>save({showPopup:false,outputVerified:true,background:true,project,workId,workScope,saveSequence})).catch(()=>setStatus('ดาวน์โหลดรูปแล้ว แต่บันทึกงานไม่สำเร็จ กรุณากดบันทึกอีกครั้ง'))},0);
  }catch(e){setStatus(e.message);setSavePopup({state:'error',title:'ดาวน์โหลดไม่สำเร็จ',message:e.message})}
  finally{exportingRef.current=false;setDownloadCropBusy(false)}
 };
 const duplicate=async()=>{if(!current||layers.length>=20)return;if(current.kind==='source-photo'){setStatus('กรุณาประมวลผลรูปก่อนคัดลอกเลเยอร์');return}const all=historySnapshot();remember();const suitCopy=layerKind(current)==='suit',headCopy=layerKind(current)==='head'||current.name==='หัว · คอ · ผม',copy={...all.find(l=>l.id===selected),id:uid(),name:current.name+' สำเนา',kind:suitCopy?'suit':headCopy?'head':null,locked:false};if(await hydrate([...all,copy])&&suitCopy)setSelected(copy.id)};
 const neckSuit=()=>state.current.find(l=>l.id===selectedRef.current&&layerKind(l)==='suit')||[...state.current].reverse().find(l=>layerKind(l)==='suit');
 const reorder=dir=>{const i=layers.findIndex(l=>l.id===selected),j=i+dir;if(j<0||j>=layers.length)return;remember();const next=[...layers];[next[i],next[j]]=[next[j],next[i]];setLayers(next)};
 const refitActiveSuit=async next=>{
  const suit=next.find(l=>layerKind(l)==='suit'),head=outputHeads(next).find(l=>l.jobId);
  if(!suit?.autoSuitFitVersion||!suit.templatePath||!head||typeof onMeasureSuitFace!=='function'||suit.warpSource||(suit.neckWidth||0)!==(Number.isFinite(suit.autoCollarFitWidth)?suit.autoCollarFitWidth:0)||suit.neckHeight||assets.current.get(suit.id)?.directPixelsReady)return next;
  const native=await nativeAsset('suit',{template:suit.templatePath},suit.sourceFrame||suit.collarFrame,null);
  const unbaked={...suit,source:native.source};
  return fitStudioSuit({layers:next,previousSuit:suit,nextSuit:unbaked,headSource:head.warpSource||head.source,headMask:head.mask,measureFace:onMeasureSuitFace,preservePlacement:true});
 };
 const selectAsset=async(kind,option)=>{
  if(!ready||assetBusy||processActive||comparing)return;
  if(kind==='suit'&&option&&suitPolicy.limited&&suitPolicy.choices.length>=suitChoiceLimit&&!suitPolicy.choices.includes(option.template)){setStatus(`เลือกชุดครบ ${suitChoiceLimit} ชุดแล้ว กรุณาเลือกชุดที่เคยเลือกไว้`);return}
  if(kind==='suit')trackUniformSelection(option,'select',option?'new':'remove');
  if(kind==='suit'&&option&&!canUseAllSuits&&!freeTemplatePaths.includes(option.template)){onRequestUnlock?.();setStatus('กรุณาตรวจสอบสิทธิ์ก่อนเลือกชุดนี้');return;}
  const target=state.current.find(l=>layerKind(l)===kind);
  if(target?.locked){setStatus('ปลดล็อกเลเยอร์ '+ASSET_NAMES[kind]+' ก่อนเปลี่ยน');return}
  const repairSuitFit=Boolean(target?.autoSuitFitVersion&&target.autoSuitFitVersion!==STUDIO_SUIT_FIT_VERSION)||state.current.some(l=>l.kind==='neck-fit');
  if(kind==='suit'&&option&&target?.templatePath===option.template&&!repairSuitFit){setSelected(target.id);return}
  const fitHead=kind==='suit'&&option&&typeof onMeasureSuitFace==='function'?outputHeads(state.current).find(l=>l.jobId):null;
  if(fitHead&&(fitHead.locked||state.current.some(l=>l.hairHeadId===fitHead.id&&l.kind!=='neck-fit'&&l.locked))){setStatus('ปลดล็อกเลเยอร์หัวและทรงผมก่อนจัดให้พอดีกับชุดใหม่');return}
  if(!target&&option&&state.current.length>=20){setStatus('เลเยอร์เต็ม 20 เลเยอร์แล้ว');return}
  setAssetBusy(true);
  try{
   flushTransforms();const previous=historySnapshot();let next,fitWarning='';
   if(!option){next=previous.filter(l=>l.id!==target?.id);}
   else{
    const suit=previous.find(l=>layerKind(l)==='suit');
    const p=placementRef.current;let collarParts=null;
    const defaultFrame=p?{x:p.uX/p.W*W,y:p.uY/p.H*H,w:p.uW/p.W*W,h:p.uH/p.H*H}:{x:0,y:0,w:W,h:H};
    const frame=kind==='suit'?(suit?.sourceFrame||suit?.collarFrame||defaultFrame):(suit?.collarFrame||suit?.sourceFrame||defaultFrame);
    const path=suit?.templatePath||p?.templatePath||'';
    const female=/female-/.test(path),base=STUDIO_ACCESSORY_PLACEMENT[female?'female':'male'];
    const preset={...base,collar:{...base.collar,width:base.collar.width*(female?.9*.85*1.08*1.09:1)*.8,y:base.collar.y-4/frame.h,left:base.collar.left+(female?.025-2/frame.w:14/frame.w),right:base.collar.right-(female?.025-2/frame.w:14/frame.w)},chest:{...base.chest,width:base.chest.width*(female?1:.85),x:base.chest.x+(female?.035:49/frame.w),y:base.chest.y-(female?0:.02)},ribbon:{...base.ribbon,x:base.ribbon.x-(female?.055:3/frame.w),width:base.ribbon.width*(female?.95:1),top:base.ribbon.top-(female?0:.02)}};
    const native=await nativeAsset(kind,option,frame,preset);collarParts=native.collarParts;
    const created={...(target||fresh({name:ASSET_NAMES[kind],source:native.source})),kind,source:native.source,sourceFrame:kind==='suit'?(target?.sourceFrame||native.sourceFrame):native.sourceFrame,collarFrame:kind==='suit'?(target?.collarFrame||frame):target?.collarFrame,neckWidth:kind==='suit'?0:target?.neckWidth,neckHeight:kind==='suit'?0:target?.neckHeight,collarParts,collarLeftX:target?.collarLeftX||0,collarRightX:target?.collarRightX||0,mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,visible:true,assetId:option.id,templatePath:kind==='suit'?option.template:target?.templatePath};
    if(kind==='background')Object.assign(created,{x:0,y:0,scale:1,squeezeX:1,squeezeY:1,rotation:0,opacity:1});
    if(['collar','chest','ribbon'].includes(kind))Object.assign(created,{x:suit?.x||0,y:suit?.y||0,scale:suit?.scale||1,rotation:suit?.rotation||0,opacity:1,collarLeftX:0,collarRightX:0,collarLeftY:0,collarRightY:0});
    next=target?previous.map(l=>l.id===target.id?created:l):kind==='background'?[created,...previous]:[...previous,created];
    if(fitHead){try{const asset=assets.current.get(fitHead.id);if(!asset)throw Error('ยังเตรียมภาพหัวไม่สำเร็จ');setStatus('กำลังจัดหัวและคอให้พอดีกับชุด…');next=await fitStudioSuit({layers:next,previousSuit:target,nextSuit:created,headSource:asset.warped||asset.original,headMask:asset.mask,measureFace:onMeasureSuitFace});fitWarning=next.find(l=>l.id===created.id)?.autoSuitFitWarning||''}catch(error){fitWarning='ยังจัดหัวอัตโนมัติไม่สำเร็จ สามารถปรับหัวและคอเสื้อเพิ่มเติมได้';next=next.map(l=>l.id===created.id?{...l,autoSuitFitVersion:null,autoCollarFitApplied:false,autoSuitFitWarning:fitWarning}:l)}}
   }
   if(await hydrate(next,new Set(previous.filter(l=>{const n=next.find(n=>n.id===l.id);return l.id!==target?.id&&n&&['sourceFrame','source','mask','warpSource','warpBaseMask','eraseRestoreSource','warpRestoreBase'].every(key=>n[key]===l[key])}).map(l=>l.id)))){if(kind==='suit'&&option&&onSelectSuit){const head=outputHeads(state.current).find(l=>l.jobId);if(head)try{setSuitPolicy(await onSelectSuit(head.jobId,[target?.templatePath,option.template].filter(Boolean)))}catch(e){await hydrate(previous);setStatus(e.message);return}}undo.current.push(previous);if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false;}redo.current=[];const chosen=next.find(l=>layerKind(l)===kind);if(chosen)setSelected(chosen.id);setRevision(v=>v+1);setStatus(option?'เลือก '+(option.name||option.title||ASSET_NAMES[kind])+' แล้ว'+(fitWarning?' · '+fitWarning:''):'นำ '+ASSET_NAMES[kind]+' ออกแล้ว');if(kind==='suit'&&(option?!target||!((option.id&&target.assetId===option.id)||(option.template&&target.templatePath===option.template)):Boolean(target)))trackUniformSelection(option,'apply',option?'new':'remove')}else setStatus('ยังแสดง '+ASSET_NAMES[kind]+' ไม่สำเร็จ งานเดิมยังอยู่ กรุณาลองเลือกอีกครั้ง');
  }catch(e){setStatus(typeof e.code==='string'&&e.code.startsWith('SUIT_FIT_')?e.message:'เลือก '+ASSET_NAMES[kind]+' ไม่สำเร็จ กรุณาลองใหม่')}
  finally{setAssetBusy(false)}
 };
 const openBackgroundColor=()=>{
  if(!ready||assetBusy||processActive||comparing)return;
  const target=state.current.find(l=>layerKind(l)==='background');
  if(target?.locked){setStatus('ปลดล็อกเลเยอร์พื้นหลังก่อนเปลี่ยนสี');return}
  if(!target&&state.current.length>=20){setStatus('เลเยอร์เต็ม 20 เลเยอร์แล้ว');return}
  flushTransforms();setBackgroundColorOpen(true);
 };
 const previewBackgroundColor=color=>{
  if(!canvasRef.current)return;
  const surface=canvas();surface.getContext('2d').fillStyle=color;surface.getContext('2d').fillRect(0,0,W,H);
  const id='studio-background-color-preview',layer={id,name:'พื้นหลัง',kind:'background',source:surface,x:0,y:0,scale:1,rotation:0,opacity:1,visible:true,sourceFrame:{x:0,y:0,w:W,h:H}};
  const map=new Map(assets.current);map.set(id,{original:surface,buffer:surface,dirty:false});
  paintScene(canvasRef.current.getContext('2d'),[layer,...state.current.filter(l=>layerKind(l)!=='background')],map);
 };
 const cancelBackgroundColor=()=>{setBackgroundColorOpen(false);drawNow()};
 const applyBackgroundColor=async color=>{
  cancelBackgroundColor();const surface=canvas(),ctx=surface.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,W,H);
  await selectAsset('background',{id:'custom-color-'+color.slice(1),name:'สี '+color,src:surface.toDataURL('image/png')});
 };
 const [pendingSourcePhoto,setPendingSourcePhoto]=useState(null),sourceChangeDialogRef=useRef(null);
 useEffect(()=>{const d=sourceChangeDialogRef.current;if(pendingSourcePhoto&&!d?.open)d?.showModal();else if(!pendingSourcePhoto&&d?.open)d.close()},[pendingSourcePhoto]);
 const addSourcePhoto=async (file,{confirmed=false}={})=>{
  if(!file||!ready||assetBusy||processActive)return;
  if(!confirmed&&outputHeads(state.current).length>0&&!restrictedTrial){setPendingSourcePhoto(file);return}
  if(state.current.length>=20){setStatus('เลเยอร์เต็ม 20 เลเยอร์แล้ว');return}
  setAssetBusy(true);let url;
  try{file=await preparePhotoInput(file);url=URL.createObjectURL(file);const im=await image(url),ratio=Math.min(W/im.width,H/im.height),w=im.width*ratio,h=im.height*ratio,source=nativeSource(im);
   const previous=historySnapshot(),photo=fresh({name:'รูปที่เพิ่ม',kind:'source-photo',source,sourceFrame:{x:(W-w)/2,y:(H-h)/2,w,h}});
   const next=replaceStudioSourceLayers(previous,photo);
   if(await hydrate(next)){const native=Object.assign(document.createElement('canvas'),{width:im.width,height:im.height});native.getContext('2d').drawImage(im,0,0);compareSourceRef.current=native.toDataURL('image/png');before.current=im;setCompareReady(true);setComparing(false);sourceLayerRef.current=photo.id;resetBrushSession();setSelected(photo.id);setTool('move');setProcessReceipt(null);receiptRequestRef.current++;const apiFile=['image/png','image/jpeg','image/webp'].includes(file.type)?file:new File([await new Promise((resolve,reject)=>native.toBlob(blob=>blob?resolve(blob):reject(Error('แปลงไฟล์ภาพไม่สำเร็จ')),'image/png'))],'portrait.png',{type:'image/png'});apiFile.idpromFemaleEyeStyle=null;apiFile.idpromStudioSourceReplacement=previous.some(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม')||sourcePhoto?.idpromStudioSourceReplacement===true;setSourcePhoto(apiFile);onNewSource?.();hairStyleMemory.current.clear();youcamHairMemory.current.clear();pendingHairProcessRef.current=null;setSelectedHair('');setPortraitMode(null);setFemaleFinishChoiceOpen(false);setPortraitChoiceOpen(Boolean(onProcessPhoto)&&!easyMode);setEasyPhotoTypeSelected(false);setEasyFaceFinish('natural');setHairConfirmed(false);setProcessHairPending(false);resetPhotoHistory();setRevision(v=>v+1);if(touch){setTouchMore(false);setTouchOpen(false);setPicker(false)}setStatus('เพิ่มรูปแล้ว · เลือกชนิดรูปเพื่อเริ่มประมวลผล')}
  }catch(error){setStatus(error.message||'เพิ่มรูปไม่สำเร็จ กรุณาเลือกไฟล์ภาพที่เปิดได้')}finally{if(url)URL.revokeObjectURL(url);setAssetBusy(false)}
 };
 useEffect(()=>{if(!initialSourcePhoto)return;let cancelled=false,url;const sourceLayer=sourceLayerRef.current;(async()=>{const file=await preparePhotoInput(initialSourcePhoto);if(cancelled)return;url=URL.createObjectURL(file);const im=await image(url);if(cancelled||sourceLayerRef.current!==sourceLayer)return;const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);compareSourceRef.current=c.toDataURL('image/png');before.current=im;setSourcePhoto(previous=>previous===initialSourcePhoto?file:previous);setCompareReady(true)})().catch(()=>{});return()=>{cancelled=true;if(url)URL.revokeObjectURL(url)}},[initialSourcePhoto]);
 const [checkingCredits,setCheckingCredits]=useState(false);
 const checkProcessCredits=async()=>{
  setCheckingCredits(true);setAssetBusy(true);setStatus('กำลังเตรียมประมวลผล…');
  try{return !onBeforeProcess||await onBeforeProcess()}
  finally{setCheckingCredits(false);setAssetBusy(false)}
 };
 const processPhoto=async(options={})=>{
  if(processRequestRef.current||!sourcePhoto||processActive||assetBusy||!ready||!onProcessPhoto)return;
  const oldHead=state.current.find(l=>l.name==='หัว · คอ · ผม');
  const newSourcePending=state.current.some(l=>l.id===sourceLayerRef.current);
  const requested=Object.prototype.hasOwnProperty.call(options,'hairId')?options:pendingHairProcessRef.current;
  const chosenHair=requested?.hairId||'';
  const chosenPortraitMode=options.portraitMode||requested?.portraitMode||portraitMode;
  if(!['female','male'].includes(chosenPortraitMode)){setPortraitChoiceOpen(true);return}
  if(chosenPortraitMode==='female'&&!['natural','makeup'].includes(sourcePhoto.idpromFemaleEyeStyle)){setFemaleFinishChoiceOpen(true);return}
  if(!requested){setHairGender(chosenPortraitMode);setProcessHairPending(true);setPicker('hair');setTouchLayersOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);return}
  if(!oldHead&&!state.current.some(l=>l.id===sourceLayerRef.current)&&state.current.length>=20){setStatus('เลเยอร์เต็ม 20 เลเยอร์แล้ว');return}if(oldHead?.locked&&!newSourcePending){setStatus('ปลดล็อกเลเยอร์หัวก่อนประมวลผล');return}
  if(oldHead&&!options.continueWithoutSave&&(hasCredits||trialUnlocked)){setHistoryNotice({kind:'reprocess'});return}
  setPortraitProcessError(null);processRequestRef.current=true;
  try{if(!await checkProcessCredits()){processRequestRef.current=false;return}}catch(e){processRequestRef.current=false;const message=e.message||'ตรวจสอบเครดิตไม่สำเร็จ';setStatus(message);setPortraitProcessError(message);return}
  if(!mounted.current){processRequestRef.current=false;return}
  setProcessHairPending(false);setPicker(false);setHairNotice(false);
  const previous=historySnapshot(),suit=previous.find(l=>layerKind(l)==='suit');if(touch){setPicker(false);setTouchMore(false);setTouchMenu(false);setTouchOpen(false)}setHairConfirmed(false);setProcessingPhoto(true);setStatus('กำลังประมวลผลรูป…');
  let stagedResult;
  try{const result=stagedResult=await onProcessPhoto(sourcePhoto,suit?.templatePath||placementRef.current?.templatePath,chosenHair,chosenPortraitMode);if(isProcessCancelled())throw Error('ยกเลิกการประมวลผลแล้ว');const head={...fresh(result.layer),...(oldHead?{id:oldHead.id}:{}),kind:'head',hairId:chosenHair,portraitMode:chosenPortraitMode,femaleEyeStyle:portraitFinishChoice(sourcePhoto.idpromFemaleEyeStyle,result.layer.femaleEyeStyle),initialFemaleEyeStyle:portraitFinishChoice(sourcePhoto.idpromFemaleEyeStyle,result.layer.initialFemaleEyeStyle,result.layer.femaleEyeStyle),processedOriginalSource:result.layer.source};const anchor=oldHead||suit;if(anchor)Object.assign(head,{x:anchor.x,y:anchor.y,scale:anchor.scale,squeezeX:anchor.squeezeX??1,squeezeY:anchor.squeezeY??1,rotation:anchor.rotation,opacity:oldHead?.opacity??1});
   let next=previous.filter(l=>l.id!==oldHead?.id&&l.id!==sourceLayerRef.current&&(!oldHead||l.hairHeadId!==oldHead.id));
   const i=next.findIndex(l=>layerKind(l)==='suit');next.splice(i<0?next.length:i,0,head);
   if(next.some(l=>layerKind(l)==='suit'&&l.autoSuitFitVersion))next=await refitActiveSuit(next);
   if(await hydrate(next)){if(isProcessCancelled()){await hydrate(previous);throw Error('ยกเลิกการประมวลผลแล้ว')}await onFinishProcess?.(true);result.commit?.();if(result.layer.outputUnlocked===true&&result.layer.jobId)sessionUnlockedJobs.current.add(result.layer.jobId);hairStyleMemory.current.clear();youcamHairMemory.current.clear();placementRef.current=result.placement;resetPhotoHistory();resetBrushSession();setTool('move');setSelected(head.id);setRevision(v=>v+1);if(touch){setTouchMore(false);setTouchOpen(false)}sourceLayerRef.current=null;setProcessHairPending(false);setHairConfirmed(true);setSelectedHair(chosenHair);pendingHairProcessRef.current=null;setStatus('ประมวลผลแล้ว · เลือกทรงใหม่เพื่อประมวลผลจากรูปต้นฉบับ');trackPhotoType(chosenPortraitMode,'apply');reportProcessedResult(result.layer,{reused:result.reused===true})}else throw Error('แสดงภาพไม่สำเร็จ');
  }catch(e){await hydrate(previous);stagedResult?.rollback?.();await onFinishProcess?.(false).catch(()=>{});setProcessHairPending(true);const message=e.message||'ประมวลผลไม่สำเร็จ กรุณาลองใหม่';setStatus(message);if(e.code!=='USER_CANCELLED')setPortraitProcessError(message)}finally{processRequestRef.current=false;setProcessingPhoto(false)}
 };
 useEffect(()=>{if(!sourcePhoto){setSourcePreview(null);return}const url=URL.createObjectURL(sourcePhoto);setSourcePreview(url);return()=>URL.revokeObjectURL(url)},[sourcePhoto]);
 const applyFreeHair=async id=>{
  if(processRequestRef.current||processActive||assetBusy||!ready)return;
  if(id&&!isFreeFemaleHair(id))return;
  flushTransforms();
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  if(!freeHairAllowed(head)){showFreeHairNotice();return}
  if(head.locked){appearanceFailure('hair','ปลดล็อกเลเยอร์หัวก่อนเปลี่ยนทรงผม');return}
  if(id&&!onPrepareHairOverlay){appearanceFailure('hair','ระบบวางทรงผมยังไม่พร้อม กรุณารีเฟรชหน้าแล้วลองใหม่');return}
  const attached=state.current.filter(l=>l.kind==='hair-preview'&&l.hairHeadId===head.id);
  const existing=attached.find(l=>l.hairRole==='front')||attached[0];
  const version='free-female-png-v2-ear-interior';
  if(id&&existing?.hairId===id&&existing.hairPreviewVersion===version){setSelected(existing.id);setSelectedHair(id);setTool('move');setStatus('เลือกทรงผมพร้อมการปรับแต่งเดิมแล้ว · ไม่ใช้เครดิต');return}
  const previous=historySnapshot(),previousPixels=historyAssets.current.get(previous),placedHead=previous.find(l=>l.id===head.id)||head;
  const current=()=>mounted.current&&state.current.some(l=>l.id===head.id&&l.jobId===head.jobId)&&!state.current.some(l=>l.id===sourceLayerRef.current);
  let placementLoading=false;
  setAppearanceError(null);processRequestRef.current=true;
  try{
   const asset=assets.current.get(head.id);if(!asset)throw Error('ไม่พบภาพหัวสำหรับวางทรงผม');
   // Scope reuse to the actual original pixels, not the temporary cleaned head.
   const baseSource=head.freeHairBaseOriginal?head.hairOriginalSource:surfaceURL(copySurface(asset.warped||asset.original));
   if(typeof baseSource!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(baseSource))throw Error('ไม่พบภาพตั้งต้นของทรงผม กรุณาเลือกไม่เลือกผมและประมวลผลก่อน');
   hairStyleMemory.current.useBase(head.id,head.jobId,baseSource);
   hairStyleMemory.current.remember(previous,previousPixels,head.id,existing?.hairId||(isFreeFemaleHair(head.hairId)?head.hairId:''),existing?(existing.hairPreviewVersion||'free-female-png-v1'):0);
   const remembered=hairStyleMemory.current.restore(previous,previousPixels,head.id,id||'',id?version:0);
   if(remembered){
    // Keep the current pose and access flags when restoring native hair pixels.
    remembered.layers=remembered.layers.map(l=>l.id===head.id?{...l,...headPose(placedHead),visible:placedHead.visible,locked:placedHead.locked,opacity:placedHead.opacity,jobId:placedHead.jobId,restrictedTrial:placedHead.restrictedTrial,outputUnlocked:placedHead.outputUnlocked,processedOriginalSource:placedHead.processedOriginalSource}:l);
    historyAssets.current.set(remembered.layers,remembered.pixels);
    if(!restoreHistory(remembered.layers))throw Error('คืนทรงผมเดิมไม่สำเร็จ · เก็บงานเดิมไว้');
    undo.current.push(previous);if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false}redo.current=[];
    resetBrushSession();setSelected(remembered.selectedId);setSelectedHair(id||'');setHairConfirmed(true);setHairNotice(false);setRevision(v=>v+1);setTool('move');setComparing(false);
    if(touch){setPicker(false);setTouchMore(false);setTouchOpen(false);setToolRailOpen(true)}
    setStatus(id?'แสดงทรงผมพร้อมการปรับแต่งเดิมแล้ว · ไม่ใช้เครดิต':'กลับเป็นไม่เลือกผมแล้ว · ไม่ใช้เครดิต');trackHairSelection(id,'apply',id?'free_reuse':'original');return;
   }
   placementLoading=true;setAssetBusy(true);setHairPlacementProgress(1);setStatus(id?'กำลังวางทรงผมและเก็บขอบ…':'กำลังกลับเป็นไม่เลือกผม…');
   // Freeze the accepted original-hair portrait once. Later free styles never use
   // a previously cleaned head or another free hairstyle as their fitting input.
   let next=previous.filter(l=>!(l.kind==='hair-preview'&&l.hairHeadId===head.id)),selectedId=head.id;
   if(id){
    const fitted=await onPrepareHairOverlay(baseSource,id,{sourceJobId:head.jobId,onProgress:value=>{if(current())setHairPlacementProgress(Math.min(85,Math.max(1,value)))}});
    if(!current())return;
    if(!fitted?.cleanedHeadSource||!fitted.source||fitted.aiComposed)throw Error('ข้อมูลทรงผมไม่ครบ · เก็บภาพเดิมไว้');
    if(next.length+(fitted.backSource?2:1)>20)throw Error('พื้นที่เลเยอร์เต็ม · ลบเลเยอร์ที่ไม่ใช้ก่อน');
    next=next.map(l=>l.id===head.id?{...l,source:fitted.cleanedHeadSource,hairOriginalSource:baseSource,freeHairBaseOriginal:true,freeHairSourceJobId:head.jobId,hairId:'',warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,hairBaseMask:null,hairOuterEraser:null}:l);
    const common={kind:'hair-preview',hairLinked:Boolean(fitted.backSource),hairId:id,hairPreviewVersion:version,freeHair:true,mask:null,sourceFrame:head.sourceFrame?{...head.sourceFrame}:undefined,...headPose(placedHead),hairHeadId:head.id,hairHeadPose:headPose(placedHead)};
    const front=existing?.hairId===id&&existing.hairRole!=='back'?{...existing,hairPreviewVersion:version}:fresh({...common,name:'ทรงผม '+id.slice(5),hairRole:'front',source:fitted.source}),index=next.findIndex(l=>l.id===head.id);
    if(fitted.backSource){const back=fresh({...common,name:'ทรงผมด้านหลัง',hairRole:'back',source:fitted.backSource});next.splice(index,0,back);next.splice(index+2,0,front)}else next.splice(index+1,0,front);
    selectedId=front.id;
   }else{
    next=next.map(l=>l.id===head.id?{...l,source:baseSource,hairOriginalSource:null,freeHairBaseOriginal:false,freeHairSourceJobId:null,hairId:'',warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,hairBaseMask:null,hairOuterEraser:null}:l);
   }
   if(!current())return;
   setHairPlacementProgress(90);await hairUiFrame();if(!current())return;
   if(!await hydrate(next,new Set(previous.filter(l=>l.kind!=='hair-preview'&&l.id!==head.id).map(l=>l.id))))throw Error('วางทรงผมไม่สำเร็จ · เก็บภาพเดิมไว้');
   undo.current.push(previous);if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false}redo.current=[];
   resetBrushSession();setSelected(selectedId);setSelectedHair(id||'');setHairConfirmed(true);setHairNotice(false);setRevision(v=>v+1);setTool('move');setComparing(false);
   if(touch){setPicker(false);setTouchMore(false);setTouchOpen(false);setToolRailOpen(true)}
   setStatus(id?'วางทรงผมและเก็บขอบแล้ว · ไม่ใช้เครดิต':'กลับเป็นไม่เลือกผมแล้ว · ไม่ใช้เครดิต');trackHairSelection(id,'apply',id?'free':'original');
   setHairPlacementProgress(100);await hairUiFrame();
  }catch(e){if(current()){await hydrate(previous).catch(()=>{});appearanceFailure('hair',e.message||'วางทรงผมไม่สำเร็จ · เก็บภาพเดิมไว้')}}finally{processRequestRef.current=false;if(mounted.current&&placementLoading){setHairPlacementProgress(null);setAssetBusy(false)}}
 };
 const applyHair=async (id,{femaleEyeStyle,portraitMode:requestedMode,appearanceKind='hair'}={})=>{
  if(processRequestRef.current||processActive||assetBusy||!ready)return;
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  if(!head||!onChangeHair){appearanceFailure(appearanceKind,'เพิ่มรูปและประมวลผลก่อนเลือกเมคอัพหรือทรงผม');return}
  if(head.locked){appearanceFailure(appearanceKind,'ปลดล็อกเลเยอร์หัวก่อนเปลี่ยนเมคอัพหรือทรงผม');return}
  const mode=requestedMode||hairGender;
  const currentFinish=portraitFinishChoice(head.femaleEyeStyle,head.initialFemaleEyeStyle,sourcePhoto?.idpromFemaleEyeStyle);
  const finish=mode==='female'?portraitFinishChoice(femaleEyeStyle,currentFinish):'natural';
  const freeHair=appearanceKind==='makeup'?state.current.find(l=>l.kind==='hair-preview'&&l.hairHeadId===head.id&&isFreeFemaleHair(l.hairId)&&l.hairRole!=='back'):null;
  if(head.hairPolicyVersion===HAIR_DESIGN_VERSION&&(head.hairId||'')===(id||'')&&(head.portraitMode||portraitMode)===mode&&currentFinish===finish){setSelected(head.id);setSelectedHair(freeHair?.hairId||id||'');setTool('move');return}
  flushTransforms();const previous=historySnapshot();
  const placedHead=previous.find(l=>l.id===head.id)||head;
  const placedFreeHair=freeHair?(previous.find(l=>l.id===freeHair.id)||freeHair):null;
  let reused=canRestoreHair(id,mode,finish),stagedResult=null;
  setAppearanceError(null);processRequestRef.current=true;
  // Cached styles do not start a generation or consume a daily trial.
  if(!reused&&typeof onBeforeProcess==='function'){
   try{if(!await checkProcessCredits()){processRequestRef.current=false;return}}
   catch(e){processRequestRef.current=false;appearanceFailure(appearanceKind,e.message||'ตรวจสอบเครดิตไม่สำเร็จ กรุณาลองใหม่');return}
   if(!mounted.current){processRequestRef.current=false;return}
  }
  setAssetBusy(true);setStatus(reused?'กำลังแสดงภาพที่เคยสร้างไว้…':appearanceKind==='makeup'?'กำลังสร้างภาพ'+(finish==='makeup'?'แต่งหน้า':'ไม่แต่งหน้า')+'…':'กำลังเปลี่ยนทรงผม ปรับผิว และเก็บขอบ…');
  try{
   const result=stagedResult=await onChangeHair(id,mode,finish);
   reused=result?.reused===true;
   if(isProcessCancelled())throw Error('ยกเลิกการประมวลผลแล้ว');
   if(!result?.layer?.source)throw Error('ไม่ได้รับภาพทรงผม');
   if((result.layer.hairId||'')!==(id||'')||portraitFinishChoice(result.layer.femaleEyeStyle,result.layer.initialFemaleEyeStyle)!==finish)throw Error('ผลลัพธ์ไม่ตรงกับเมคอัพหรือทรงผมที่เลือก');
   const replacement={...result.layer,...headPose(placedHead),squeezeX:1,squeezeY:1,id:head.id,name:placedHead.name||result.layer.name,kind:'head',hairId:id||'',visible:placedHead.visible!==false,locked:placedHead.locked??false,opacity:placedHead.opacity??1,sourceFrame:result.layer.sourceFrame?{...result.layer.sourceFrame}:null,hairPolicyVersion:HAIR_DESIGN_VERSION,processedOriginalSource:result.layer.source};
   // Use this hairstyle's own returned/cached master. Do not carry the
   // previous hairstyle's skin profile or local makeup recipe into it.
   let next=replaceHairstyleLayer(previous,head.id,replacement);
   // Free hairstyles remain local PNG overlays when the underlying finish changes.
   // Fit them to the new native head before committing either set of pixels.
   if(freeHair){
    if(!onPrepareHairOverlay)throw Error('ระบบวางทรงผมยังไม่พร้อม · เก็บภาพเดิมไว้');
    const baseSource=surfaceURL(result.layer.source);
    const fitted=await onPrepareHairOverlay(baseSource,freeHair.hairId,{sourceJobId:result.layer.jobId});
    if(isProcessCancelled())throw Error('ยกเลิกการประมวลผลแล้ว');
    if(!fitted?.cleanedHeadSource||!fitted.source||fitted.aiComposed)throw Error('ข้อมูลทรงผมไม่ครบ · เก็บภาพเดิมไว้');
    if(next.length+(fitted.backSource?2:1)>20)throw Error('พื้นที่เลเยอร์เต็ม · ลบเลเยอร์ที่ไม่ใช้ก่อน');
    next=next.map(l=>l.id===head.id?{...l,source:fitted.cleanedHeadSource,hairOriginalSource:baseSource,freeHairBaseOriginal:true,freeHairSourceJobId:result.layer.jobId,hairId:''}:l);
    const common={kind:'hair-preview',hairLinked:Boolean(fitted.backSource),hairId:freeHair.hairId,hairPreviewVersion:'free-female-png-v2-ear-interior',freeHair:true,mask:null,sourceFrame:replacement.sourceFrame?{...replacement.sourceFrame}:undefined,...headPose(replacement),hairHeadId:head.id,hairHeadPose:headPose(replacement)};
    const keepPose=layer=>layer?{...headPose(layer),visible:layer.visible!==false,locked:layer.locked??false,opacity:layer.opacity??1}:{};
    const front=fresh({...common,...keepPose(placedFreeHair),name:freeHair.name||'ทรงผม '+freeHair.hairId.slice(5),hairRole:'front',source:fitted.source}),index=next.findIndex(l=>l.id===head.id);
    if(fitted.backSource){const oldBack=previous.find(l=>l.kind==='hair-preview'&&l.hairHeadId===head.id&&l.hairId===freeHair.hairId&&l.hairRole==='back');const back=fresh({...common,...keepPose(oldBack),name:'ทรงผมด้านหลัง',hairRole:'back',source:fitted.backSource});next.splice(index,0,back);next.splice(index+2,0,front)}else next.splice(index+1,0,front);
   }
   if(next.some(l=>layerKind(l)==='suit'&&l.autoSuitFitVersion))next=await refitActiveSuit(next);
   if(!await hydrate(next,new Set(previous.filter(l=>next.includes(l)).map(l=>l.id))))throw Error('แสดงภาพไม่สำเร็จ');
   if(isProcessCancelled()){await hydrate(previous);throw Error('ยกเลิกการประมวลผลแล้ว')}
   if(!reused)await onFinishProcess?.(true);
   result.commit?.();
   if(sourcePhoto)sourcePhoto.idpromFemaleEyeStyle=finish;
   resetPhotoHistory();resetBrushSession();setSelected(head.id);setSelectedHair(freeHair?.hairId||id||'');setHairConfirmed(true);setHairNotice(false);setRevision(v=>v+1);setTool('move');setComparing(false);
   if(touch){setPicker(false);setTouchMore(false);setTouchOpen(false);setToolRailOpen(true)}
   if(appearanceKind==='hair'){trackHairSelection(id,'apply',reused?'reuse':id?'new':'original');reportProcessedResult(result.layer,{reused})}else setStatus(reused?'แสดงภาพ'+(finish==='makeup'?'แต่งหน้า':'ไม่แต่งหน้า')+'ที่เคยสร้างไว้แล้ว':'เปลี่ยนเป็น'+(finish==='makeup'?'แต่งหน้า':'ไม่แต่งหน้า')+'แล้ว');
  }catch(e){stagedResult?.rollback?.();await hydrate(previous).catch(()=>{});if(!reused)await onFinishProcess?.(false).catch(()=>{});appearanceFailure(appearanceKind,e.message||'เปลี่ยนเมคอัพหรือทรงผมไม่สำเร็จ · เก็บภาพเดิมไว้')}finally{processRequestRef.current=false;if(mounted.current)setAssetBusy(false)}
 };
 const selectPortraitFinish=style=>{
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  if(!['makeup','natural'].includes(style)||!head?.jobId||(head.portraitMode||portraitMode)!=='female'||!sourcePhoto||processHairPending||state.current.some(l=>l.id===sourceLayerRef.current))return;
  void applyHair(head.freeHairBaseOriginal?'':head.hairId||'',{femaleEyeStyle:style,portraitMode:'female',appearanceKind:'makeup'});
 };
 const commitMakeupSource=async(head,previous,source,base,full,look,intensity,signal)=>{
  const next=previous.map(l=>l.id===head.id?{...l,source,mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,makeupBaseSource:base,makeupCleanBaseSource:base,makeupFullSource:intensity===100?null:full,makeupStyles:{look},makeupIntensity:intensity,makeupRenderVersion:'skin-current-layer-v2'}:l);
  if(signal?.aborted)throw Object.assign(Error('ยกเลิกการประมวลผลแล้ว'),{name:'AbortError'});
  if(!mounted.current)return false;
  if(!await hydrate(next,new Set(previous.filter(l=>l.id!==head.id).map(l=>l.id))))throw Error('แสดงผลผิวไม่สำเร็จ');
  if(signal?.aborted){await hydrate(previous);throw Object.assign(Error('ยกเลิกการประมวลผลแล้ว'),{name:'AbortError'})}
  undo.current.push(previous);if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false}redo.current=[];setSelected(head.id);setRevision(v=>v+1);return true;
 };
 const applyMakeup=async lookId=>{
  if(makeupRequestRef.current||processActive||assetBusy){appearanceFailure('makeup','กรุณารอการทำงานก่อนหน้าให้เสร็จก่อน');return}
  if(!ready){appearanceFailure('makeup','รูปยังไม่พร้อม กรุณารอสักครู่หรือเปิดรูปอีกครั้ง');return}
  if(!onMakeup||!makeupLook(lookId)){appearanceFailure('makeup','ระบบผิวยังไม่พร้อม กรุณารีเฟรชหน้าแล้วลองใหม่');return}
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');if(!head){appearanceFailure('makeup','เพิ่มรูปและประมวลผลก่อนใช้ผิว');return}if(head.locked){appearanceFailure('makeup','ปลดล็อกเลเยอร์หัวก่อนปรับผิว');return}
  if(head.makeupRenderVersion==='skin-current-layer-v2'&&head.makeupStyles?.look===lookId&&(head.makeupIntensity??100)===100&&(!head.mask||head.youcamNativeHead)&&!head.warpSource)return;
  let base,cachedFull;
  try{
   const asset=assets.current.get(head.id);if(!asset?.buffer)throw Error('ภาพยังไม่พร้อมสำหรับผิว กรุณาเปิดรูปอีกครั้ง');
   // Capture current layer pixels in native coordinates, including edits/mask.
   // Placement stays in the layer metadata and is never baked into the image.
   flushTransforms();
   const currentPixels=asset.warped||asset.original;
   const currentSurface=Object.assign(document.createElement('canvas'),{width:currentPixels.width,height:currentPixels.height});
   const skinCtx=currentSurface.getContext('2d');skinCtx.drawImage(currentPixels,0,0);
   if(asset.mask){skinCtx.globalCompositeOperation='destination-in';skinCtx.drawImage(asset.mask,0,0,currentSurface.width,currentSurface.height);skinCtx.globalCompositeOperation='source-over'}
   base=surfaceURL(studioMakeupBase(head,currentSurface));
   cachedFull=makeupLookCacheRef.current.peek(head.id,base,lookId)||(head.makeupRenderVersion==='skin-current-layer-v2'&&head.makeupStyles?.look===lookId&&head.makeupBaseSource===base?head.makeupFullSource:null);
  }catch(e){appearanceFailure('makeup',e.message||'เตรียมภาพผิวไม่สำเร็จ กรุณาเปิดรูปอีกครั้ง');return}
  const reused=Boolean(cachedFull);
  const operation=new AbortController();makeupOperationRef.current=operation;setMakeupCancelled(false);
  setAppearanceError(null);makeupRequestRef.current=true;if(reused)setAssetBusy(true);else{startMakeupProgress();setMakeupBusy(true)}setStatus(reused?'กำลังเปลี่ยนผิวเดิม…':'กำลังปรับโทน'+makeupLook(lookId).name+'…');
  try{
   flushTransforms();paintScene(canvasRef.current.getContext('2d'),state.current,assets.current);
   const previous=historySnapshot();
   const full=cachedFull||await makeupLookCacheRef.current.get(head.id,base,lookId,()=>head.makeupRenderVersion==='skin-current-layer-v2'&&head.makeupStyles?.look===lookId&&head.makeupBaseSource===base&&head.makeupFullSource?head.makeupFullSource:onMakeup(base,{look:lookId},{signal:operation.signal,onProgress:value=>{if(mounted.current&&!operation.signal.aborted)setMakeupProgress(v=>Math.max(v,Math.min(98,value)))}}));
   if(!reused)setMakeupProgress(v=>Math.max(v,95));
   const source=await mixMakeupLookSources(base,full,100);
   if(!reused)setMakeupProgress(v=>Math.max(v,98));
   if(await commitMakeupSource(head,previous,source,base,full,lookId,100,operation.signal)){if(!reused)await finishMakeupProgress();setStatus('ปรับโทน'+makeupLook(lookId).name+'แล้ว'+(reused?' · ใช้ผลเดิม':''))}
  }catch(e){if(mounted.current)appearanceFailure('makeup',operation.signal.aborted?'ยกเลิกการประมวลผลแล้ว · เก็บภาพเดิมไว้':e.message||'ผิวไม่สำเร็จ · เก็บภาพเดิมไว้')}finally{stopMakeupProgress();if(makeupOperationRef.current===operation)makeupOperationRef.current=null;makeupRequestRef.current=false;if(mounted.current){if(reused)setAssetBusy(false);else setMakeupBusy(false)}}
 };
 // Preview never changes the saved source or creates an undo step.
 const makeupPreview=useRef({frame:null,token:0,surface:null});
 const cancelMakeupPreview=()=>{const p=makeupPreview.current;++p.token;if(p.frame!==null)cancelAnimationFrame(p.frame);p.frame=null};
 useEffect(()=>()=>cancelMakeupPreview(),[]);
 const previewMakeupIntensity=value=>{
  setMakeupIntensity(value);const p=makeupPreview.current;const token=++p.token;
  if(p.frame!==null)cancelAnimationFrame(p.frame);
  p.frame=requestAnimationFrame(async()=>{p.frame=null;
   const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม'),asset=assets.current.get(head?.id);
   if(!asset||!head?.makeupBaseSource||head.locked||(head.mask&&!head.youcamNativeHead)||head.warpSource||makeupRequestRef.current)return;
   const full=head.makeupFullSource||((head.makeupIntensity??100)===100?head.source:null);if(!full)return;
   try{const source=await mixMakeupLookSources(head.makeupBaseSource,full,value,p.surface||(p.surface=document.createElement('canvas')));const original=await image(source);
    if(!mounted.current||token!==p.token||state.current.find(l=>l.id===head.id)!==head)return;
    asset.original=original;asset.dirty=true;asset.dirtyRect=null;drawNow();
   }catch{/* The committed portrait remains intact if a preview fails. */}
  });
 };
 const applyMakeupIntensity=async value=>{
  const intensity=Math.max(0,Math.min(100,Number(value)));
  if(!Number.isFinite(intensity)||makeupRequestRef.current||processActive||assetBusy||!ready)return;
  const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');
  if(!head?.makeupBaseSource||!head.makeupStyles?.look||head.locked||(head.mask&&!head.youcamNativeHead)||head.warpSource||(head.makeupIntensity??100)===intensity)return;
  const full=head.makeupFullSource||((head.makeupIntensity??100)===100?head.source:null);
  if(!full)return;
  cancelMakeupPreview();const operation=new AbortController();makeupOperationRef.current=operation;setMakeupCancelled(false);startMakeupProgress();setMakeupBusy(true);makeupRequestRef.current=true;
  try{
   flushTransforms();const previous=historySnapshot();
   const source=await mixMakeupLookSources(head.makeupBaseSource,full,intensity);
   if(await commitMakeupSource(head,previous,source,head.makeupBaseSource,full,head.makeupStyles.look,intensity,operation.signal)){await finishMakeupProgress();setStatus('ปรับความเข้มผิวแล้ว')}
  }catch(e){const asset=assets.current.get(head.id);if(asset){asset.original=await image(head.source);asset.dirty=true;asset.dirtyRect=null;drawNow()}setMakeupIntensity(head.makeupIntensity??100);setStatus(e.message||'ปรับความเข้มไม่สำเร็จ · เก็บภาพเดิมไว้')}finally{stopMakeupProgress();if(makeupOperationRef.current===operation)makeupOperationRef.current=null;makeupRequestRef.current=false;if(mounted.current)setMakeupBusy(false)}
 };
 const restoreMakeup=async()=>{
  if(processActive||assetBusy||!ready)return;const head=state.current.find(l=>layerKind(l)==='head'||l.name==='หัว · คอ · ผม');if(!head?.makeupBaseSource||head.locked)return;
  setAssetBusy(true);try{const previous=historySnapshot(),next=previous.map(l=>l.id===head.id?{...l,source:l.makeupBaseSource,mask:null,warpSource:null,warpBaseMask:null,eraseRestoreSource:null,warpRestoreBase:null,makeupStyles:{},makeupBaseSource:null,makeupFullSource:null,makeupIntensity:100}:l);if(await hydrate(next,new Set(previous.filter(l=>l.id!==head.id).map(l=>l.id)))){undo.current.push(previous);redo.current=[];setRevision(v=>v+1);if(undo.current.length>15){undo.current.shift();historyTruncatedRef.current=true;historyBoundaryNoticeRef.current=false}setStatus('คืนภาพก่อนปรับผิวแล้ว · ไม่ใช้เครดิต')}}finally{setAssetBusy(false)}
 };
 const scrollCatalog=direction=>{
  const rail=catalogRailRef.current;if(!rail)return;
  if(picker==='hair'){stepHairRail(rail,direction);return;}
  rail.scrollBy({left:direction*Math.max(160,rail.clientWidth*.8),behavior:'smooth'});
 };
 useEffect(()=>{if(!picker)return;if(picker!=='hair'&&picker!=='suit')catalogRailRef.current?.scrollTo({left:0});const close=e=>{if(e.key==='Escape'&&!processActive&&!assetBusy)setPicker(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[picker,processActive,assetBusy]);
 useEffect(()=>{if(picker!=='suit')return;const rail=catalogRailRef.current;if(!rail)return;const frame=requestAnimationFrame(()=>{if(catalogRailRef.current===rail)rail.scrollLeft=suitRailPositions.current[assetGroup]||0});return()=>cancelAnimationFrame(frame)},[picker,assetGroup]);
 // Recommended order applies only to the combined suit tab; category order stays intact.
 const popularSuitIds=['female-formal-suit','male-formal-tie-suit','female-operational','interior-01','female-white-shirt','male-white-shirt-v132','female-suit-03','male-suit-03','female-academic','interior-02','kmitl-female','kmitl-male'];
 const popularSuits=picker==='suit'&&assetGroup==='all'?[...templates].sort((a,b)=>{const ai=popularSuitIds.indexOf(a.id),bi=popularSuitIds.indexOf(b.id);return (ai<0?popularSuitIds.length:ai)-(bi<0?popularSuitIds.length:bi)}):templates;
 const catalogOptions=picker==='suit'?popularSuits:picker==='collar'?collarPins:picker==='chest'?chestPins:picker==='ribbon'?ribbons:picker==='background'?backgrounds:[];
 const groups=[...new Set(templates.map(t=>t.group).filter(Boolean))];
 useEffect(()=>{
  if(!picker||['hair','makeup'].includes(picker))return;
  const paths=catalogOptions.filter(o=>picker!=='suit'||assetGroup==='all'||o.group===assetGroup).slice(0,4).flatMap(o=>picker==='collar'?[o.left,o.right]:[o.template||o.src]).filter(Boolean);
  let cancelled=false,index=0,timer=null;
  const run=()=>{if(cancelled||index>=paths.length)return;image(paths[index++]).catch(()=>{}).finally(()=>{if(!cancelled)timer=setTimeout(run,0)})};
  timer=setTimeout(run,120);return()=>{cancelled=true;clearTimeout(timer)};
 },[picker,assetGroup]);

 const layerControls=<>{brushLayerRequired&&<p className="studio-brush-layer-required" role="status">เลือกเลเยอร์สำหรับ{tool==='paint'?'บรัชระบายสี':tool==='erase'?'ยางลบ':'บิดรูป'}ก่อนใช้งาน</p>}<h2>เลเยอร์ <small>{layers.length}</small></h2><p className="studio-layer-help">เลือกเลเยอร์ก่อนแก้ไข · บนสุดอยู่ด้านหน้า</p><div ref={desktopLayersRef} className={'studio-layers'+(!touch&&layerGuide?' studio-desktop-layer-attention':'')}>{[...layers].reverse().map(l=><div key={l.id} className={selected===l.id?'selected':''}><button className="studio-layer-name" disabled={!ready||assetBusy||processActive} onClick={()=>choosePart(l.id)}>{<img className="studio-layer-thumbnail" src={touchThumbnails[l.id]||l.source} alt=""/>}<span>{l.name}</span></button><button disabled={!ready||assetBusy} aria-label={'แสดงหรือซ่อน '+l.name} onClick={()=>{remember();setLayers(ls=>ls.map(a=>a.id===l.id?{...a,visible:!a.visible}:a))}}>{l.visible?'◉':'○'}</button><button disabled={!ready||assetBusy} aria-label={'ล็อก '+l.name} onClick={()=>{remember();setLayers(ls=>ls.map(a=>a.id===l.id?{...a,locked:!a.locked}:a))}}>{l.locked?'🔒':'🔓'}</button>{<button className="studio-delete-layer" title="ลบเลเยอร์" aria-label={'ลบเลเยอร์ '+l.name} disabled={!ready||assetBusy||processActive||comparing} onClick={()=>deleteLayer(l.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg></button>}</div>)}</div></>;
 const previewBrushSize=size=>{const c=canvasRef.current,ring=cursorRef.current;if(!c||!ring)return;const diameter=size*c.getBoundingClientRect().width/W;ring.style.width=diameter+'px';ring.style.height=diameter+'px'};
 const touchRange=(label,value,min,max,setValue)=> <label className="studio-compact-range"><span>{label}</span><output>{value}{label==='ขนาด'?' px':'%'}</output><button aria-label={'ลด'+label} onClick={()=>setValue(Math.max(min,value-1))}>−</button><input aria-label={['ขอบฟุ้ง','ความโปร่งใส'].includes(label)?label:label==='แรงบิด'?'แรงบิดรูป':tool==='warp'?'ขนาดบิดรูป':label==='ขนาด'?'ขนาดแปรง':'ความนุ่มแปรง'} type="range" min={min} max={max} value={value} onChange={e=>setValue(+e.target.value)}/><button aria-label={'เพิ่ม'+label} onClick={()=>setValue(Math.min(max,value+1))}>+</button></label>;
 const warpControls=<>{tool==='warp' &&<fieldset className="studio-warp-panel" disabled={brushLayerRequired||!current||current.locked||!ready||assetBusy||comparing}><legend>บิดรูป</legend><div className="studio-warp-modes">{[['push','↗','ดัน'],['shrink','›‹','หด'],['expand','‹›','ขยาย'],['clockwise','↻','หมุนขวา'],['counterclockwise','↺','หมุนซ้าย']].map(([id,icon,name])=><button key={id} className={warpMode===id?'active':''} aria-pressed={warpMode===id} onClick={()=>setWarpMode(id)}><b><StudioToolIcon kind={'warp-'+id}/></b><span>{name}</span></button>)}</div>{touch?<>{<BrushSizeRange value={warpSize} min={20} max={400} onCommit={setWarpSize} onPreview={previewBrushSize} ariaLabel="ขนาดบิดรูป"/>}{touchRange('แรงบิด',warpStrength,1,100,setWarpStrength)}</>:<><DesktopRange label="ขนาดบิดรูป" value={warpSize} min={20} max={400} display={warpSize+' px'} onValue={setWarpSize}><input aria-label="ขนาดบิดรูป" type="range" min="20" max="400" value={warpSize} onChange={e=>setWarpSize(+e.target.value)}/></DesktopRange><DesktopRange label="แรงบิด" value={warpStrength} min={1} max={100} display={warpStrength+'%'} onValue={setWarpStrength}><input aria-label="แรงบิดรูป" type="range" min="1" max="100" value={warpStrength} onChange={e=>setWarpStrength(+e.target.value)}/></DesktopRange></>}<button onClick={resetWarp}>คืนรูปก่อนบิด</button><p>เลือกเลเยอร์แล้วลากบนภาพ · บิดเฉพาะบริเวณวงแปรง · 2 นิ้วซูมและเลื่อน</p></fieldset>}</>;
 const neckControls=tool==='neck'&&<fieldset className="studio-neck-panel" disabled={!current||layerKind(current)!=='suit'||current.locked||!ready||assetBusy||comparing}><div className="studio-neck-ranges">{[['neckWidth','หุบ–ขยายคอเสื้อ'],['neckHeight','ความสูงคอเสื้อ']].map(([key,label])=><label className="studio-compact-range" key={key}><span>{label}</span><output>{(current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))>0?'+':''}{current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0)}%</output><button aria-label={'ลด'+label} onClick={()=>change({[key]:Math.max(-200,(current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))-1)})}>−</button><input aria-label={label} type="range" min="-200" max="200" step="1" value={current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0)} onPointerDown={remember} onKeyDown={e=>{if(e.key.startsWith('Arrow')||e.key==='Home'||e.key==='End')remember()}} onChange={e=>change({[key]:+e.target.value},false)}/><button aria-label={'เพิ่ม'+label} onClick={()=>change({[key]:Math.min(200,(current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))+1)})}>+</button></label>)}</div><button onClick={()=>change({neckWidth:0,neckHeight:0})}>รีเซ็ตคอเสื้อ</button></fieldset>;
 const layerActions=<div className="studio-layer-actions"><button disabled={!current||!ready||assetBusy} onClick={()=>reorder(1)} aria-label="ขึ้น" title="ขึ้น"><StudioToolIcon kind="layer-up"/></button><button disabled={!current||!ready||assetBusy} onClick={()=>reorder(-1)} aria-label="ลง" title="ลง"><StudioToolIcon kind="layer-down"/></button><button disabled={!current||!ready||layers.length>=20} onClick={duplicate} aria-label="คัดลอก" title="คัดลอก"><StudioToolIcon kind="layer-copy"/></button></div>;
 const desktopLayerControls=<section className="studio-desktop-parts" aria-label="เลเยอร์">{layerControls}{layerActions}</section>;
 const paintControls=tool==='paint'&&<fieldset className="studio-brush-panel" disabled={brushLayerRequired||!current||current.locked||!ready||assetBusy||comparing}><legend>บรัชระบายสี</legend><label style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>สีแปรง <input type="color" aria-label="สีแปรง" value={paintColor} onChange={e=>setPaintColor(e.target.value)} style={{width:52,height:32,padding:2,flex:'0 0 52px'}}/></label>{touch?<><BrushSizeRange value={brush} min={4} max={200} onCommit={setBrush} onPreview={previewBrushSize} ariaLabel="ขนาดแปรงระบายสี"/>{touchRange('ขอบฟุ้ง',soft,0,100,setSoft)}{touchRange('ความโปร่งใส',100-paintOpacity,0,100,v=>setPaintOpacity(100-v))}</>:<><DesktopRange label="ขนาดแปรง" value={brush} min={4} max={200} display={brush+' px'} onValue={setBrush}><input aria-label="ขนาดแปรงระบายสี" type="range" min="4" max="200" value={brush} onChange={e=>setBrush(+e.target.value)}/></DesktopRange><DesktopRange label="ขอบฟุ้ง" value={soft} min={0} max={100} display={soft+'%'} onValue={setSoft}><input aria-label="ขอบฟุ้ง" type="range" min="0" max="100" value={soft} onChange={e=>setSoft(+e.target.value)}/></DesktopRange><DesktopRange label="ความโปร่งใส" value={100-paintOpacity} min={0} max={100} display={(100-paintOpacity)+'%'} onValue={v=>setPaintOpacity(100-v)}><input aria-label="ความโปร่งใส" type="range" min="0" max="100" value={100-paintOpacity} onChange={e=>setPaintOpacity(100-Number(e.target.value))}/></DesktopRange></>}<p>ระบายบนเลเยอร์ที่เลือก · ย้อนกลับเพื่อลบรอยล่าสุด</p></fieldset>;
 const adjustmentControls=<>{paintControls}{neckControls}{tool!=='neck'&&<>{touch?<>{warpControls}{!['erase','warp','restore','paint'].includes(tool)&&layerControls}</>:warpControls}{(['move','transform'].includes(tool))&&(layerKind(current||{})==='collar'||current?.collarParts)&&<fieldset className="studio-collar-sides" disabled={current.locked||!ready||assetBusy||comparing||Boolean(assets.current.get(current.id)?.warped)}><legend>เลือกเข็มปกคอ</legend><div>{[["auto","แตะเลือก"],["both","ทั้งคู่"],["left","ซ้าย"],["right","ขวา"]].map(([side,label])=><button key={side} aria-pressed={collarSide===side} onClick={()=>setCollarSide(side)}>{label}</button>)}</div><p>เลือกซ้ายหรือขวา แล้วแตะเข็มเพื่อลากแยกชิ้น · เลือกทั้งคู่เพื่อลากพร้อมกัน</p>{[['collarLeftX','เข็มด้านซ้าย'],['collarRightX','เข็มด้านขวา']].map(([key,label])=>(touch?<label key={key}>{label}<output>{current[key]||0} px</output><input aria-label={'เลื่อน'+label+'ซ้าย–ขวา'} type="range" min="-900" max="900" step="1" value={current[key]||0} onPointerDown={remember} onKeyDown={e=>{if(e.key.startsWith('Arrow')||e.key==='Home'||e.key==='End')remember()}} onChange={e=>change({[key]:Number(e.target.value)},false)}/></label>:<DesktopRange key={key} label={label} value={current[key]||0} min={-900} max={900} display={(current[key]||0)+' px'} onStart={remember} onValue={value=>change({[key]:value},false)}><input aria-label={'เลื่อน'+label+'ซ้าย–ขวา'} type="range" min="-900" max="900" step="1" value={current[key]||0} onPointerDown={remember} onKeyDown={e=>{if(e.key.startsWith('Arrow')||e.key==='Home'||e.key==='End')remember()}} onChange={e=>change({[key]:Number(e.target.value)},false)}/></DesktopRange>))}<button onClick={()=>change({collarLeftX:0,collarRightX:0,collarLeftY:0,collarRightY:0})}>รีเซ็ตเข็มแยกด้าน</button>{assets.current.get(current.id)?.warped&&<p>กดคืนรูปก่อนบิด เพื่อปรับเข็มแยกด้าน</p>}<p>ซ้าย/ขวาตามภาพ · เครื่องมือด้านล่างปรับเข็มทั้งคู่</p></fieldset>}{touch&&tool!=='erase'&&layerActions}{(['move','transform'].includes(tool))&&<fieldset disabled={!current||current.locked||!ready||assetBusy||comparing}><legend>{current?.name||'เลือกเลเยอร์'}</legend>{[['x','ซ้าย–ขวา',-900,900,1],['y','ขึ้น–ลง',-1200,1200,1],['scale','ขนาด',.1,3,.01],['squeezeX','บีบด้านข้าง',.1,3,.01],['squeezeY','บีบด้านบน',.1,3,.01],['rotation','หมุน',-180,180,1],['opacity','ความทึบ',0,1,.01]].map(([key,label,min,max,step])=>(touch?<label key={key}>{label}<output>{['scale','opacity','squeezeX','squeezeY'].includes(key)?Math.round((current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))*100)+'%':Math.round(current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))+(key==='rotation'?'°':' px')}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:min)} onPointerDown={remember} onKeyDown={e=>{if(e.key.startsWith('Arrow'))remember()}} onChange={e=>change({[key]:Number(e.target.value)},false)}/></label>:<DesktopRange key={key} label={label} value={current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:min)} min={min} max={max} step={step} display={['scale','opacity','squeezeX','squeezeY'].includes(key)?Math.round((current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))*100)+'%':Math.round(current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:0))+(key==='rotation'?'°':' px')} onStart={remember} onValue={value=>change({[key]:value},false)}><input aria-label={label} type="range" min={min} max={max} step={step} value={current?.[key]??(['squeezeX','squeezeY'].includes(key)?1:min)} onPointerDown={remember} onKeyDown={e=>{if(e.key.startsWith('Arrow'))remember()}} onChange={e=>change({[key]:Number(e.target.value)},false)}/></DesktopRange>))}<button onClick={()=>change({x:0,y:0,scale:1,squeezeX:1,squeezeY:1,rotation:0,opacity:1})}>รีเซ็ตตำแหน่ง</button>{current?.name.startsWith('ชุด')&&<button onClick={()=>{setPicker('suit')}}>เปลี่ยนชุด…</button>}</fieldset>}{(tool==='erase'||tool==='restore')&&<fieldset className="studio-brush-panel" disabled={brushLayerRequired||!current||current.locked||!ready||assetBusy||comparing}><legend>{tool==='erase'?'ยางลบ':'คืนขอบ'}</legend>{touch?<>{<BrushSizeRange value={brush} min={4} max={200} onCommit={setBrush} onPreview={previewBrushSize} ariaLabel="ขนาดแปรง"/>}{touchRange(tool==='erase'?'ขอบฟุ้ง':'ความนุ่ม',soft,0,tool==='erase'?100:95,setSoft)}{tool==='erase'&&touchRange('ความโปร่งใส',eraseOpacity,0,100,setEraseOpacity)}</>:<><DesktopRange label="ขนาดแปรง" value={brush} min={4} max={200} display={brush+' px'} onValue={setBrush}><input aria-label="ขนาดแปรง" type="range" min="4" max="200" value={brush} onChange={e=>setBrush(+e.target.value)}/></DesktopRange><DesktopRange label={tool==='erase'?'ขอบฟุ้ง':'ความนุ่ม'} value={soft} min={0} max={tool==='erase'?100:95} display={soft+'%'} onValue={setSoft}><input aria-label={tool==='erase'?'ขอบฟุ้ง':'ความนุ่มแปรง'} type="range" min="0" max={tool==='erase'?100:95} value={soft} onChange={e=>setSoft(+e.target.value)}/></DesktopRange>{tool==='erase'&&<DesktopRange label="ความโปร่งใส" value={eraseOpacity} min={0} max={100} display={eraseOpacity+'%'} onValue={setEraseOpacity}><input aria-label="ความโปร่งใส" type="range" min="0" max="100" value={eraseOpacity} onChange={e=>setEraseOpacity(+e.target.value)}/></DesktopRange>}</>}</fieldset>}{tool==='pan'&&<fieldset className="studio-pan-panel"><legend>เลื่อนภาพ</legend><label>ซูมมุมมอง <output>{Math.round(view.zoom*100)}%</output><input aria-label="ซูมมุมมอง" type="range" min="30" max="500" value={Math.round(view.zoom*100)} onChange={e=>setView(v=>({...v,zoom:+e.target.value/100}))}/></label><button onClick={()=>queueView({zoom:1,x:0,y:0})}>รีเซ็ตมุมมอง</button></fieldset>}</>}</>;
 const photoControls=<>{onProcessPhoto&&<section className="studio-photo-panel"><h2>สร้างรูปใน Studio</h2>{sourcePreview&&<img className="studio-source-preview" src={sourcePreview} alt="รูปต้นฉบับ"/>}<div><button className="studio-upload-action" disabled={processActive||assetBusy||!ready} onClick={()=>photoInputRef.current.click()}>{!touch&&<StudioToolIcon kind="upload"/>}{sourcePhoto?'เปลี่ยนรูปต้นฉบับ':'เพิ่มรูปต้นฉบับ'}</button><StudioPhotoGuide/></div>{processActive&&<div className="studio-process-progress" role="status"><p>{processLabel}</p><progress max="100" value={displayProgress}/></div>}</section>}</>;
 const easyControl=(layer,key,label,min,max,step=1)=>{const value=layer?.[key]??(key==='scale'?1:0);return <label key={key} className="easy-adjust-control"><span className="easy-adjust-label"><span className="easy-adjust-control-icon"><EasyUIIcon kind={key==='scale'?'scale':key==='rotation'?'rotation':key==='y'||key==='neckHeight'||key.endsWith('Y')?'vertical':'horizontal'} size={19}/></span><span>{label}</span></span><span className="easy-adjust-inline"><input type="range" aria-label={`${layer.name} ${label}`} min={min} max={max} step={step} value={value} disabled={layer.locked||!ready||assetBusy||processActive} onPointerDown={()=>{flushTransforms();remember()}} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)&&!e.repeat){flushTransforms();remember()}}} onChange={e=>{selectedRef.current=layer.id;setSelected(layer.id);change({[key]:Number(e.target.value)},false);flushTransforms();setRevision(v=>v+1)}}/><output>{Math.round(value*(key==='scale'?100:1))}{key==='scale'||key.startsWith('neck')?'%':key==='rotation'?'°':' px'}</output><span className="easy-adjust-stepper"><button type="button" aria-label={`ลด ${label}`} disabled={layer.locked||!ready||assetBusy||processActive||value<=min} onClick={()=>{flushTransforms();remember();selectedRef.current=layer.id;setSelected(layer.id);change({[key]:Math.max(min,Number((value-(key==='scale'?.01:1)).toFixed(3)))},false);flushTransforms();setRevision(v=>v+1)}}>−</button><button type="button" aria-label={`เพิ่ม ${label}`} disabled={layer.locked||!ready||assetBusy||processActive||value>=max} onClick={()=>{flushTransforms();remember();selectedRef.current=layer.id;setSelected(layer.id);change({[key]:Math.min(max,Number((value+(key==='scale'?.01:1)).toFixed(3)))},false);flushTransforms();setRevision(v=>v+1)}}>+</button></span></span></label>};
 const resetEasyAdjustment=id=>{const layer=state.current.find(l=>l.id===id);if(!layer||layer.locked||!ready||assetBusy||processActive)return;flushTransforms();remember();selectedRef.current=id;setSelected(id);change(layerKind(layer)==='suit'?{neckWidth:0,neckHeight:0}:{scale:1,x:0,y:0,rotation:0,...(layerKind(layer)==='collar'?{collarLeftX:0,collarLeftY:0,collarRightX:0,collarRightY:0}:{})},false);flushTransforms();setRevision(v=>v+1)};
 const easyAdjust=<EasyAdjustmentTabs onReset={resetEasyAdjustment}><h2>ปรับรูป</h2>{layers.filter(l=>['head','suit','collar','chest','ribbon'].includes(layerKind(l))).sort((a,b)=>['head','suit','collar','chest','ribbon'].indexOf(layerKind(a))-['head','suit','collar','chest','ribbon'].indexOf(layerKind(b))).map(layer=><section className="easy-adjust-group" key={layer.id} data-layer-id={layer.id} data-reset-disabled={layer.locked||!ready||assetBusy||processActive} data-label={layerKind(layer)==='head'?'หัวและใบหน้า':layerKind(layer)==='suit'?'คอเสื้อ':layer.name}><h3>{layerKind(layer)==='head'?'หัวและใบหน้า':layer.name}</h3>{layerKind(layer)==='suit'?<>{easyControl(layer,'neckWidth','บีบ–ขยายคอเสื้อ',-200,200)}{easyControl(layer,'neckHeight','ความสูงคอเสื้อ',-200,200)}</>:<>{easyControl(layer,'scale',layerKind(layer)==='head'?'ขนาดหัว':'ขนาด',.1,3,.01)}{easyControl(layer,'x','ซ้าย–ขวา',-900,900)}{easyControl(layer,'y','ขึ้น–ลง',-1200,1200)}{layerKind(layer)!=='head'&&easyControl(layer,'rotation','หมุน',-180,180)}{layerKind(layer)==='collar'&&<>{easyControl(layer,'collarLeftX','เข็มซ้าย: ซ้าย–ขวา',-900,900)}{easyControl(layer,'collarLeftY','เข็มซ้าย: ขึ้น–ลง',-1200,1200)}{easyControl(layer,'collarRightX','เข็มขวา: ซ้าย–ขวา',-900,900)}{easyControl(layer,'collarRightY','เข็มขวา: ขึ้น–ลง',-1200,1200)}</>}</>}</section>)}</EasyAdjustmentTabs>;
 const easyInsignia=<section>{[['collar','เข็มปกคอ',collarPins],['chest','เข็มติดอก',chestPins],['ribbon','แพรแถบ',ribbons]].map(([kind,label,options])=><div key={kind}><h3>{label}</h3><div className="easy-rail"><button disabled={assetBusy||processActive} onClick={()=>selectAsset(kind,null)}>ไม่ติด</button>{options.map(o=><button key={o.id} disabled={assetBusy||processActive} onClick={()=>selectAsset(kind,o)}><img src={o.left||o.src||o.preview} alt=""/><small>{o.name}</small></button>)}</div></div>)}</section>;
 const easyHasResult=outputHeads(layers).length>0;
 const selectEasyPhotoType=mode=>{if(!sourcePhoto||easyHasResult||assetBusy||processActive||!['female','male'].includes(mode))return;trackPhotoType(mode,'select');setPortraitMode(mode);setHairGender(mode);setEasyPhotoTypeSelected(true);setEasyFaceFinish('natural');sourcePhoto.idpromFemaleEyeStyle='natural';setPortraitChoiceOpen(false);setFemaleFinishChoiceOpen(false);setProcessHairPending(true);pendingHairProcessRef.current=null;setSelectedHair('');setPicker(false);setStatus('เลือกชนิดรูปแล้ว · เลือกทรงผม ชุด และพื้นหลังได้เลย')};
 const selectEasyFaceFinish=style=>{if(!sourcePhoto||easyHasResult||hairGender!=='female'||!['natural','makeup'].includes(style))return;sourcePhoto.idpromFemaleEyeStyle=style;setEasyFaceFinish(style);setFemaleFinishChoiceOpen(false)};
 const processEasyPhoto=hairId=>{if(!sourcePhoto||!easyPhotoTypeSelected){setStatus('กรุณาเลือกชนิดรูปก่อนประมวลผล');return}const suit=templates.find(t=>t.template===currentSuit);if(suit?.gender&&suit.gender!==hairGender){setStatus('กรุณาเลือกชุด'+(hairGender==='male'?'ผู้ชาย':'ผู้หญิง')+'ให้ตรงกับชนิดรูปก่อนประมวลผล');return}void processPhoto({hairId:hairId||'',portraitMode:hairGender,continueWithoutSave:true})};
 const easyUi=<>{easyMode?<EasyMode adjustments={easyAdjust} insignia={easyInsignia} renderVersion={revision} canvasRef={canvasRef} sourcePreview={sourcePreview} hasResult={easyHasResult} watermarked={restrictedTrial} ready={ready} busy={processActive||assetBusy} processing={processActive||hairPlacementProgress!==null} progress={hairPlacementProgress??displayProgress} onCancelProcess={closeProcessing} status={status} gender={hairGender} photoTypeSelected={easyPhotoTypeSelected||easyHasResult} faceFinish={easyFaceFinish} onSelectPhotoType={selectEasyPhotoType} onSelectFaceFinish={selectEasyFaceFinish} memberMenu={memberMenu} hairs={(hairGender==='male'?maleHair:femaleHair).map(h=>({...h,locked:isPremiumHair(h.id)&&!premiumHairAllowed,disabled:!isFreeFemaleHair(h.id)&&!canRestoreHair(h.id)&&!paidHairAccess&&(trialHairRemaining<=0||!isTrialHairAllowed(h.id))}))} selectedHair={selectedHair} templates={templates} backgrounds={backgrounds} currentSuit={currentSuit} currentBackground={layers.find(l=>layerKind(l)==='background')?.assetId} onUpload={()=>photoInputRef.current?.click()} onHair={easyHasResult?chooseHair:processEasyPhoto} onSuit={option=>selectAsset('suit',option)} onBackground={option=>selectAsset('background',option)} onDownload={()=>exportImage('image/png')} onStudio={()=>{setEasyMode(false);setPicker(false)}} onHome={requestExit}/>:!touch&&<button type="button" className="easy-return" disabled={processActive||assetBusy} onClick={()=>{if(brushSession.current){setStatus('กรุณาจบการใช้แปรงก่อนเปลี่ยนโหมด');return}setComparing(false);setPicker(false);setEasyMode(true)}}>โหมดง่าย</button>}</>;
 return <main onPointerDownCapture={e=>{if(!isPrimaryEditingPointer(e)){e.preventDefault();e.stopPropagation()}}} onContextMenuCapture={preventEditorControlContextMenu} className={'idstudio'+(touch?' studio-touch':'')} data-more={touchMore} data-tools-open={!touch||toolRailOpen}>{easyUi}{<dialog ref={sourceChangeDialogRef} className="studio-exit-dialog" aria-labelledby="studio-change-source-title" aria-describedby="studio-change-source-message" onCancel={e=>{e.preventDefault();setPendingSourcePhoto(null)}}><h2 id="studio-change-source-title">ดาวน์โหลดรูปก่อนเปลี่ยนรูป</h2><p id="studio-change-source-message">กรุณาตรวจสอบว่าได้ดาวน์โหลดรูปนี้ลงบนอุปกรณ์ของท่านเรียบร้อยแล้ว หากเพิ่มรูปใหม่จะไม่สามารถย้อนกลับได้</p><div><button type="button" autoFocus onClick={()=>{setPendingSourcePhoto(null);sourceChangeDialogRef.current?.close();void exportImage('image/png')}}>ดาวน์โหลด</button><button type="button" onClick={()=>{const file=pendingSourcePhoto;setPendingSourcePhoto(null);sourceChangeDialogRef.current?.close();if(file)void addSourcePhoto(file,{confirmed:true})}}>ยืนยันเปลี่ยนรูป</button><button type="button" aria-label="ปิดคำเตือนเปลี่ยนรูป" onClick={()=>setPendingSourcePhoto(null)}>ยกเลิก</button></div></dialog>}{processReceipt&&!easyMode&&createPortal(<ProcessResultNotice notice={processReceipt} remaining={processReceipt.remaining} onClose={()=>setProcessReceipt(null)} onDownload={()=>{const trial=processReceipt.kind==='trial';setProcessReceipt(null);if(trial)onRequestUnlock?.();else void exportImage('image/png')}} onSave={()=>{if(processReceipt.canSave)void retryReceiptSave();else{setProcessReceipt(null);void save()}}} onManage={()=>{setProcessReceipt(null);onOpenSavedWorks?.()}}/>,document.body)}{backgroundColorOpen&&createPortal(<StudioBackgroundColor initialColor={(()=>{const id=state.current.find(l=>layerKind(l)==='background')?.assetId||'';return /^custom-color-[a-f\d]{6}$/i.test(id)?'#'+id.slice(-6):'#FFFFFF'})()} onPreview={previewBackgroundColor} onApply={applyBackgroundColor} onCancel={cancelBackgroundColor}/>,document.body)}{downloadCrop&&createPortal(<div style={{position:'relative',zIndex:40000}}><PhotoSizeEditor blob={downloadCrop.blob} trial={restrictedTrial} value={DEFAULT_PHOTO_CROP} sizes={STUDIO_DOWNLOAD_SIZES} pixelScale={2} applyLabel="ดาวน์โหลด/ปลดล็อคลายน้ำ" busy={downloadCropBusy} onApply={finishDownloadCrop} onClose={()=>{if(!exportingRef.current)setDownloadCrop(null)}}/></div>,document.body)}{touch?<header inert={easyMode} className="studio-touch-header"><button aria-label="กลับหน้าหลัก" disabled={!ready||assetBusy||processActive||accountSaveNotice?.state==='saving'} onClick={requestExit}>‹</button><strong>IDพร้อม <em>Studio</em></strong>{!easyMode&&<button type="button" className="studio-easy-return" disabled={processActive||assetBusy} onClick={()=>{if(brushSession.current){setStatus('กรุณาจบการใช้แปรงก่อนเปลี่ยนโหมด');return}setComparing(false);setPicker(false);setEasyMode(true)}}>โหมดง่าย</button>}<div className="studio-touch-header-actions">{onProcessPhoto&&<button type="button" className={'studio-header-upload'+(!sourcePhoto?' studio-header-upload-start':'')} aria-label={sourcePhoto?'เปลี่ยนรูป':'เพิ่มรูป'} title={sourcePhoto?'เปลี่ยนรูป':'เพิ่มรูป'} disabled={!ready||processActive||assetBusy} onClick={()=>photoInputRef.current?.click()}><svg className="studio-header-upload-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg><span>{sourcePhoto?'เปลี่ยนรูป':'เพิ่มรูป'}</span></button>}<StudioMobileFileMenu onRights={onOpenRights||onRequestUnlock} onLogout={requestLogout} disabled={!ready||assetBusy||processActive} onSave={onSaveWork?save:undefined} onOpen={()=>fileRef.current.click()} onWorks={onOpenSavedWorks} onExport={exportImage}/></div></header>:<header inert={easyMode}><button aria-label="กลับหน้าหลัก" title="กลับหน้าหลัก" disabled={!ready||assetBusy||processActive||accountSaveNotice?.state==='saving'} onClick={requestExit}>‹ กลับหน้าหลัก</button><strong>IDพร้อม <em>Studio</em></strong><div><StudioFileActions onRights={onOpenRights||onRequestUnlock} onLogout={requestLogout} disabled={!ready||assetBusy||processActive} onSave={onSaveWork?save:undefined} onOpen={()=>fileRef.current.click()} onWorks={onOpenSavedWorks} onExport={exportImage}/></div></header>}{touch&&processActive&&<div className="studio-header-process-progress"><progress aria-label="ความคืบหน้าประมวลผล" max="100" value={displayProgress}/></div>}<input hidden ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)addSourcePhoto(file)}}/><input hidden ref={fileRef} type="file" accept=".idstudio,.json" onChange={load}/><fieldset inert={easyMode} className="studio-operation-lock" disabled={processActive}><div className="studio-body"><nav ref={touchToolsMenuRef} id="studio-tool-rail" className={"studio-tools"+(touch?" studio-mobile-tool-menu":"")} hidden={touch&&!touchToolsOpen} aria-label="เครื่องมือ Studio">{[['move','↗','ย้าย'],['warp','≈','บิดรูป'],['erase','◩','ยางลบ'],['paint','✎','บรัชระบายสี'],['restore','◒','คืนขอบ']].map(([id,icon,name])=><button key={id} aria-label={name} disabled={touch&&(!ready||assetBusy||processActive||comparing)} className={tool===id?'active':''} onClick={()=>selectEditorTool(id)}><b><StudioToolIcon kind={id}/></b><span>{name}</span></button>)}{touch&&<><button className="studio-rail-history" disabled={!ready||assetBusy||processActive} onClick={()=>history(true)} aria-label="ย้อนกลับ"><b><StudioToolIcon kind="undo"/></b><span>ย้อนกลับ</span></button><button className="studio-rail-history" disabled={!ready||assetBusy||processActive} onClick={()=>history(false)} aria-label="ทำซ้ำ"><b><StudioToolIcon kind="redo"/></b><span>ทำซ้ำ</span></button><button aria-label="เลื่อนภาพ" title="เลื่อนภาพ" aria-pressed={tool==='pan'} disabled={!ready||assetBusy||processActive||comparing} className={tool==='pan'?'active':''} onClick={()=>{if(touch){setTouchToolsOpen(false);if(chooseCanvasTool('pan'))return;}setTool('pan');setCursor(null);setLayerGuide(false);setPicker(false);setTouchLayersOpen(false);if(touch){setToolRailOpen(true);setTouchOpen(false);setTouchMore('tool')}}}><b><StudioToolIcon kind="pan"/></b><span>เลื่อนภาพ</span></button></>}</nav>{touch&&touchLayersOpen&&<section className="studio-touch-layer-picker" aria-label="เลือกเลเยอร์"><button className="studio-layer-none" aria-label="ไม่เลือกเลเยอร์" aria-pressed={!selected} onClick={()=>choosePart(null)}><StudioToolIcon kind="none"/><span>ไม่เลือก</span></button>{layerControls}<div className="studio-layer-actions"><button disabled={!current||!ready||assetBusy} onClick={()=>reorder(1)} aria-label="ขึ้น" title="ขึ้น"><StudioToolIcon kind="layer-up"/></button><button disabled={!current||!ready||assetBusy} onClick={()=>reorder(-1)} aria-label="ลง" title="ลง"><StudioToolIcon kind="layer-down"/></button><button disabled={!current||!ready||layers.length>=20} onClick={duplicate} aria-label="คัดลอก" title="คัดลอก"><StudioToolIcon kind="layer-copy"/></button></div></section>}<section className="studio-workspace">{!touch&&<div className="studio-desktop-history-actions" aria-label="ย้อนกลับ ทำซ้ำ และก่อนหลัง"><button className="studio-rail-history" disabled={!ready||assetBusy||processActive} onClick={()=>history(true)} aria-label="ย้อนกลับ"><b><StudioToolIcon kind="undo"/></b><span>ย้อนกลับ</span></button><button className="studio-rail-history" disabled={!ready||assetBusy||processActive} onClick={()=>history(false)} aria-label="ทำซ้ำ"><b><StudioToolIcon kind="redo"/></b><span>ทำซ้ำ</span></button><button aria-label="ก่อน/หลัง" title={comparing?'รูปต้นฉบับ · กดเพื่อดูผลลัพธ์':'เปรียบเทียบกับรูปต้นฉบับ'} aria-pressed={comparing} disabled={!ready||!compareReady} className={comparing?'active':''} onClick={()=>setComparing(v=>!v)}><b><StudioToolIcon kind="compare"/></b><span>ก่อน/หลัง</span></button><button aria-label="เลื่อนภาพ" title="เลื่อนภาพ" aria-pressed={tool==='pan'} disabled={!ready||assetBusy||processActive||comparing} className={tool==='pan'?'active':''} onClick={()=>{setTool('pan');setCursor(null);setLayerGuide(false);setPicker(false);setTouchLayersOpen(false);if(touch){setToolRailOpen(true);setTouchOpen(false);setTouchMore('tool')}}}><b><StudioToolIcon kind="pan"/></b><span>เลื่อนภาพ</span></button></div>}{!touch&&onProcessPhoto&&<div className="studio-floating-workflow" aria-label="เพิ่มรูปและประมวลผล">{photoControls}</div>}{touch&&<div className="studio-touch-floating-actions" aria-label="เครื่องมือและประวัติ"><button ref={touchToolsButtonRef} type="button" className="studio-floating-history studio-floating-tools" aria-label={touchToolsOpen?'ปิดเครื่องมือ':'เปิดเครื่องมือ'} title="เครื่องมือ" aria-expanded={touchToolsOpen} aria-controls="studio-tool-rail" disabled={!ready||assetBusy||processActive} onClick={toggleTouchTools}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h10.5M18.5 5H21M3 12h2.5M10.5 12H21M3 19h10.5M18.5 19H21" stroke="#f1f7fa"/><circle cx="16" cy="5" r="2.5" stroke="#f1f7fa"/><circle cx="8" cy="12" r="2.5" stroke="#42bfd9"/><circle cx="16" cy="19" r="2.5" stroke="#f1f7fa"/></svg></button><button className="studio-floating-history studio-floating-layers" aria-label={touchLayersOpen?'ซ่อนเลเยอร์':'เลือกเลเยอร์'} aria-expanded={touchLayersOpen} disabled={!ready||assetBusy||processActive} onClick={()=>{setTouchToolsOpen(false);setTouchLayersOpen(v=>!v);setTouchOpen(false);setTouchMore(false);setPicker(false)}}><StudioToolIcon kind="layers"/></button><button className={'studio-floating-history'+(comparing?' active':'')} aria-label="ก่อน/หลัง" title={comparing?'รูปต้นฉบับ · กดเพื่อดูผลลัพธ์':'เปรียบเทียบกับรูปต้นฉบับ'} aria-pressed={comparing} disabled={!ready||!compareReady||assetBusy||processActive} onClick={()=>setComparing(v=>!v)}><StudioToolIcon kind="compare"/></button><button className="studio-floating-history" aria-label="ย้อนกลับ" disabled={!ready||assetBusy||processActive} onClick={()=>history(true)}><StudioToolIcon kind="undo"/></button><button className="studio-floating-history" aria-label="ทำซ้ำ" disabled={!ready||assetBusy||processActive} onClick={()=>history(false)}><StudioToolIcon kind="redo"/></button>{(()=>{const id=tool==='transform'?'move':tool,name={move:'ย้าย',neck:'ปรับคอเสื้อ',warp:'บิดรูป',erase:'ยางลบ',paint:'บรัชระบายสี',restore:'คืนขอบ',pan:'เลื่อนภาพ'}[id];return name&&<button type="button" className="studio-floating-history active" aria-label={'เครื่องมือที่เลือก: '+name} title={'เครื่องมือที่เลือก: '+name} aria-pressed="true" disabled={!ready||assetBusy||processActive||comparing} onClick={reopenCurrentToolAdjust}><StudioToolIcon kind={id}/></button>})()}</div>}<div ref={stageRef} className="studio-stage" onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(!isPrimaryEditingPointer(e))return;updateCursor(e);down(e)}} onPointerMove={move} onPointerLeave={()=>{brushPreviewActive.current=false;setCursor(null)}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onWheel={e=>queueView(v=>({...v,zoom:Math.max(.3,Math.min(5,v.zoom*(e.deltaY<0?1.1:.9)))}))}><canvas ref={canvasRef} width={(placementRef.current?.W||1128)*2} height={(placementRef.current?.H||1536)*2} style={{aspectRatio:`${placementRef.current?.W||1128}/${placementRef.current?.H||1536}`,transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}}/>{(['move','transform'].includes(tool))&&<svg ref={outlineRef} className="studio-selection-outline" viewBox="0 0 900 1200" aria-hidden={!['move','transform'].includes(tool)}><g transform={current?`translate(${450+current.x} ${600+current.y}) rotate(${current.rotation}) scale(${layerAxes(current).x} ${layerAxes(current).y}) translate(-450 -600)`:''}>{selectionBoxes.map((b,i)=><rect className="studio-shape-body" style={{pointerEvents:'none'}} key={i} x={b.x-5} y={b.y-5} width={b.w+10} height={b.h+10} rx="8" vectorEffect="non-scaling-stroke"/>)}{['move','transform'].includes(tool)&&current&&!current.locked&&selectionBoxes.map((b,i)=>{const k=Math.max(.03,outlineRatio*current.scale),pad=current.collarParts?24/k:5,ry=b.y-pad-48/k;return <g key={'handles'+i}><path d={`M${b.x+b.w/2} ${b.y-5}V${ry}`} vectorEffect="non-scaling-stroke"/>{[[b.x-pad,b.y-pad],[b.x+b.w+pad,b.y-pad],[b.x+b.w+pad,b.y+b.h+pad],[b.x-pad,b.y+b.h+pad],[b.x+b.w/2,ry]].map(([x,y],j)=><g key={j}><circle className="studio-shape-grip" role="button" tabIndex="0" aria-label={j===4?'หมุนเลเยอร์':'ปรับขนาดมุม '+(j+1)} cx={x} cy={y} r={(current.collarParts?12:16)/k} onPointerDown={e=>startShape(e,j===4?'shape-rotate':'shape-scale')} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const n=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;change(j===4?{rotation:Math.max(-180,Math.min(180,current.rotation+n))}:{scale:Math.max(.1,Math.min(3,current.scale+n*.01))})}}/><circle className="studio-shape-dot" cx={x} cy={y} r={6/k} vectorEffect="non-scaling-stroke"/></g>)}{[[b.x+b.w/2,b.y-pad,'y','top','บีบด้านบน'],[b.x-pad,b.y+b.h/2,'x','left','บีบด้านซ้าย'],[b.x+b.w+pad,b.y+b.h/2,'x','right','บีบด้านขวา']].map(([x,y,axis,side,label])=><g key={side}><circle className="studio-shape-grip" role="button" tabIndex="0" aria-label={label} cx={x} cy={y} r={16/k} onPointerDown={e=>startShape(e,'shape-squeeze-'+axis,b,side)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const key=axis==='x'?'squeezeX':'squeezeY',n=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;change(squeezeTransform(current,b,axis,(current[key]??1)+n*.01,side))}}/><circle className="studio-shape-dot" cx={x} cy={y} r={6/k} vectorEffect="non-scaling-stroke"/></g>)}</g>})}</g></svg>}{brushTool&&!comparing&&cursor&&<div ref={cursorRef} aria-label="พื้นที่แปรง" className="studio-warp-cursor" style={{left:cursor.x,top:cursor.y,width:cursor.size,height:cursor.size}}/>}{restrictedTrial&&watermarkRect&&<div ref={watermarkRef} className="studio-trial-watermark" style={watermarkRect} aria-hidden="true">{Array.from({length:27},(_,i)=><span key={i} style={{fontSize:34}}>ตัวอย่าง IDพร้อม</span>)}</div>}</div><footer><button onClick={()=>queueView({zoom:1,x:0,y:0})}>{Math.round(view.zoom*100)}% · รีเซ็ตมุมมอง</button><span>2 นิ้วซูม/เลื่อน · 1 นิ้วใช้เครื่องมือ</span></footer></section><div className="studio-side-panels">{touch&&touchMore&&<><button className="studio-change-tools" onClick={()=>{setTouchToolsOpen(true);setToolRailOpen(true);setTouchOpen(false);setTouchMore(false)}}>เปลี่ยนเครื่องมือ</button><button className="studio-touch-panel-close" aria-label="ปิดแผงเครื่องมือ" onClick={()=>{setTouchMore(false);setTouchOpen(false);setToolRailOpen(true)}}><span aria-hidden="true">⌄</span></button></>}<aside className="studio-panel studio-adjustment" aria-label="ปรับภาพ"><h2 className="studio-section-title">ปรับภาพ</h2>{touch&&photoControls}{touch?adjustmentControls:<>{desktopLayerControls}<div className="studio-adjust-scroll" aria-label="เครื่องมือปรับแต่ง">{adjustmentControls}</div></>}</aside></div></div>{touch&&touchOpen&&['move','transform'].includes(tool)&&!picker&&!touchMore&&<TouchAdjust onChooseTool={()=>{setTouchToolsOpen(true);setToolRailOpen(true);setTouchOpen(false);setTouchMore(false)}} current={current} open={touchOpen} setOpen={v=>{setTouchOpen(v);if(!v)setToolRailOpen(true)}} tab={touchTab} setTab={setTouchTab} side={touchSide} setSide={setTouchSide} change={change} remember={remember} disabled={!ready||assetBusy||processActive||comparing} warped={Boolean(assets.current.get(current?.id)?.warped)} more={touchMore} setMore={setTouchMore}/>}<div className="studio-floating-picker">{picker&&<section ref={pickerDrawerRef} className="studio-picker-drawer" aria-label="ตัวเลือกองค์ประกอบ" onPointerDownCapture={startPickerSwipe} onPointerMoveCapture={movePickerSwipe} onPointerUpCapture={endPickerSwipe} onPointerCancelCapture={endPickerSwipe} onClickCapture={e=>{if(Date.now()<pickerSuppressClickRef.current){e.preventDefault();e.stopPropagation()}}}><section className="studio-catalog">{appearanceError?.kind===picker&&<p role="alert" style={{display:'block',color:'#ffc5c5',fontSize:13,margin:'0 0 8px'}}>{appearanceError.message}</p>}{picker&&picker!=='hair'&&picker!=='makeup'&&<>{picker==='suit'&&groups.length>0&&<div className="studio-uniform-group-tabs" role="tablist" aria-label="หมวดชุด Studio">{['all',...groups].map((g,i)=><button key={g} id={'studio-suit-tab-'+i} role="tab" aria-selected={assetGroup===g} aria-controls="studio-suit-choices" tabIndex={assetGroup===g?0:-1} className={assetGroup===g?'active':''} disabled={assetBusy||!ready} onClick={()=>{rememberSuitRail();setAssetGroup(g)}} onKeyDown={e=>{const keys={ArrowRight:1,ArrowLeft:-1};if(!(e.key in keys)&&e.key!=='Home'&&e.key!=='End')return;e.preventDefault();const choices=['all',...groups],next=e.key==='Home'?0:e.key==='End'?choices.length-1:(i+keys[e.key]+choices.length)%choices.length;rememberSuitRail();setAssetGroup(choices[next]);e.currentTarget.parentElement.querySelectorAll('[role=tab]')[next]?.focus()}}>{g==='all'?'ยอดนิยม':g}</button>)}</div>}<div className="studio-choice-rail-wrap"><button className="studio-rail-arrow" aria-label="เลื่อนตัวเลือกไปทางซ้าย" onClick={()=>scrollCatalog(-1)}>‹</button><div ref={catalogRailRef} className="studio-catalog-grid" onScroll={e=>{if(picker==='suit')suitRailPositions.current[assetGroup]=e.currentTarget.scrollLeft}} id={picker==='suit'?'studio-suit-choices':undefined} role={picker==='suit'?'tabpanel':undefined} aria-labelledby={picker==='suit'?'studio-suit-tab-'+['all',...groups].indexOf(assetGroup):undefined}><button className="studio-none-choice" aria-label={'ไม่เลือก'+ASSET_NAMES[picker]} disabled={assetBusy||!ready} onClick={()=>selectAsset(picker,null)}><span><StudioToolIcon kind="none"/></span><small>{['suit','background'].includes(picker)?'ไม่เลือก':'ไม่ติด'}{ASSET_NAMES[picker]}</small></button>{catalogOptions.filter(o=>picker!=='suit'||assetGroup==='all'||o.group===assetGroup).map((o,i)=><button key={o.id||i} aria-label={'เลือก'+ASSET_NAMES[picker]+' '+(o.name||o.title||o.id)} className={(layers.find(l=>layerKind(l)===picker)?.assetId===o.id||(picker==='suit'&&layers.find(l=>layerKind(l)==='suit')?.templatePath===o.template))?'active':''} disabled={assetBusy||!ready||(picker==='suit'&&suitPolicy.limited&&suitPolicy.choices.length>=suitChoiceLimit&&!suitPolicy.choices.includes(o.template))} onClick={()=>selectAsset(picker,o)}><span>{picker==='collar'?<><CatalogPreview src={o.left} eager={i<4}/><CatalogPreview src={o.right} eager={i<4}/></>:<CatalogPreview src={o.preview||o.src||o.template} eager={i<4}/>}</span><small>{picker==='suit'&&!canUseAllSuits&&!freeTemplatePaths.includes(o.template)?'🔒 ':''}{o.name||o.title||o.id}</small></button>)}{picker==='background'&&<button type="button" aria-label="เลือกสีพื้นหลังเอง" disabled={assetBusy||!ready||processActive||comparing} onClick={openBackgroundColor}><span style={{background:'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)',borderRadius:8}}/><small>เลือกสีเอง</small></button>}</div><button className="studio-rail-arrow" aria-label="เลื่อนตัวเลือกไปทางขวา" onClick={()=>scrollCatalog(1)}>›</button></div></>}{picker==='makeup'&&<MakeupPanel portraitFinish={portraitFinishChoice(makeupHead?.femaleEyeStyle,makeupHead?.initialFemaleEyeStyle,sourcePhoto?.idpromFemaleEyeStyle)} onPortraitFinishSelect={selectPortraitFinish} canSelectPortraitFinish={Boolean(sourcePhoto&&makeupHead?.jobId&&(makeupHead.portraitMode||portraitMode)==='female'&&!processHairPending&&!layers.some(l=>l.id===sourceLayerRef.current))} lookId={makeupStyles.look||null} intensity={makeupIntensity} onSelect={applyMakeup} onIntensityChange={previewMakeupIntensity} onIntensityCommit={applyMakeupIntensity} canAdjustIntensity={Boolean(makeupHead?.makeupStyles?.look&&makeupHead?.makeupBaseSource&&(!makeupHead?.mask||makeupHead?.youcamNativeHead)&&!makeupHead?.warpSource&&!makeupHead?.eraseRestoreSource)} onRestore={restoreMakeup} canRestore={Boolean(makeupHead?.makeupBaseSource)} disabled={processActive||assetBusy||!ready||Boolean(makeupHead?.locked)} hasHead={Boolean(makeupHead)}/>}
{picker==='suit'&&(suitPolicy.limited||suitPolicyError)&&<p role="status" style={{padding:'8px 12px',margin:0}}>{suitPolicyError||`เลือกชุดแล้ว ${suitPolicy.choices.length}/${suitChoiceLimit} ชุด · กลับมาเลือกชุดเดิมได้`}</p>}{picker==='hair'&&<section className="studio-hair-panel"><div className="studio-hair-gender">{[['female','หญิง'],['male','ชาย']].map(([id,name])=><button key={id} className={hairGender===id?'active':''} onClick={()=>setHairGender(id)}>{name}</button>)}</div><div className="studio-choice-rail-wrap"><button className="studio-rail-arrow" aria-label="เลื่อนตัวเลือกไปทางซ้าย" onClick={()=>scrollCatalog(-1)}>‹</button><div ref={catalogRailRef} className="studio-catalog-grid" onPointerDown={e=>stopHairRail(e.currentTarget)} onWheel={e=>stopHairRail(e.currentTarget)} onScroll={e=>{hairRailPositions.current[hairGender]=e.currentTarget.scrollLeft}}><button className={'studio-none-choice'+(!selectedHair?' active':'')} aria-pressed={!selectedHair} onClick={()=>chooseHair('')}><span><StudioToolIcon kind="none"/></span><small>ไม่เลือกผม</small></button>{[...(hairGender==='male'?maleHair:femaleHair)].sort((a,b)=>hairGender==='female'?0:Number(/^youcam-[fm]/.test(a.id))-Number(/^youcam-[fm]/.test(b.id))).map((h,i)=><button key={h.id} aria-label={'เลือก'+(hairGender==='male'?'ทรงผมชาย ':'ทรงผมหญิง ')+h.name} aria-pressed={selectedHair===h.id} className={selectedHair===h.id?'active':''} disabled={!isFreeFemaleHair(h.id)&&!canRestoreHair(h.id)&&!paidHairAccess&&(trialHairRemaining<=0||!isTrialHairAllowed(h.id))} onClick={()=>chooseHair(h.id)}><span className="studio-hair-face-preview" style={{position:'relative'}}><CatalogPreview src={h.src} eager={i<4} maleHair={hairGender==='male'}/>{((isPremiumHair(h.id)&&!premiumHairAllowed)||(!isFreeFemaleHair(h.id)&&!canRestoreHair(h.id)&&!paidHairAccess&&(trialHairRemaining<=0||!isTrialHairAllowed(h.id))))&&<svg role="img" aria-label="ปลดล็อกทรงผมด้วยโปร 159 บาท" width="16" height="16" viewBox="0 0 24 22" style={{position:'absolute',right:4,top:4,width:16,height:16,background:'none',border:'none',borderRadius:0,boxShadow:'none',pointerEvents:'none'}}><title>เลือกแพ็กเกจเพื่อประมวลผลทรงผม</title><path d="M2 7 7 1.5h10L22 7 12 20.5Z" fill="#42bfd9" stroke="#249dbb" strokeWidth="0.8" strokeLinejoin="round"/><path d="m7 1.5 5 5.5 5-5.5M2 7h20M7 1.5l5 19 5-19" fill="none" stroke="#c7f3fa" strokeWidth="0.7" strokeLinejoin="round"/><path d="M3 6.5 7.1 2h2L6.6 6.5Z" fill="#e8fbff"/></svg>}</span>{isFreeFemaleHair(h.id)&&<small>ฟรี</small>}</button>)}</div><button className="studio-rail-arrow" aria-label="เลื่อนตัวเลือกไปทางขวา" onClick={()=>scrollCatalog(1)}>›</button></div></section>}</section></section>}<nav className="studio-catalog-tabs studio-bottom-choices" aria-label="หมวดองค์ประกอบ">{[['makeup','เมคอัพ'],['neck','ปรับคอเสื้อ'],['suit','ชุด'],['hair','ทรงผม'],['collar','เข็มปกคอ'],['chest','เข็มติดอก'],['ribbon','แพรแถบ'],['background','พื้นหลัง']].map(([id,name])=><button key={id} title={touch&&id==='hair'&&sourcePhoto&&!hairConfirmed?'เลือกทรงผมเพื่อประมวลผลจากรูปต้นฉบับ':name} className={[(id==='neck'?tool==='neck'&&!picker&&(!touch||touchMore==='tool'):picker===id)?'active':'',touch&&id==='hair'&&sourcePhoto&&!hairConfirmed?'studio-hair-attention':''].filter(Boolean).join(' ')} disabled={id==='neck'?touch&&(!ready||assetBusy||processActive||comparing):!ready||assetBusy||comparing} aria-pressed={id==='neck'?tool==='neck'&&!picker&&(!touch||touchMore==='tool'):picker===id} aria-expanded={id==='neck'?tool==='neck'&&!picker&&(!touch||touchMore==='tool'):picker===id} onClick={()=>{if(id==='neck'){setPicker(false);selectEditorTool('neck');return}setTouchLayersOpen(false);setPicker(picker===id?false:id);setTouchMore(false);setTouchMenu(false);if(picker==='suit')rememberSuitRail();if(id!=='suit')setAssetGroup('all');if(id!=='hair'&&picker!=='hair'&&id!=='suit')catalogRailRef.current?.scrollTo({left:0})}}>{id==='neck'?<StudioToolIcon kind="neck"/>:<StudioChoiceIcon kind={id}/>}<span>{name}</span></button>)}</nav></div></fieldset><footer className="studio-feedback" hidden={!status&&!checkingCredits}><p className="studio-status" role="status" aria-live="polite">{checkingCredits?'กำลังเตรียมประมวลผล…':status}</p></footer>{!easyMode&&hairPlacementProgress!==null&&<div className="studio-processing-overlay studio-wait-overlay"><section className="studio-processing-card studio-wait-card" role="status" aria-live="polite" aria-busy={hairPlacementProgress<100}><div className="studio-wait-ring"><span className="studio-processing-spinner" aria-hidden="true"/><output>{hairPlacementProgress}%</output></div><h2>{hairPlacementProgress===100?'วางทรงผมแล้ว':'กำลังจัดวางทรงผม…'}</h2><progress aria-label="ขั้นตอนการวางทรงผม" max="100" value={hairPlacementProgress}/><p>กรุณารอสักครู่จนกว่าจะเสร็จ</p></section></div>}{!easyMode&&processActive&&(processProgress.cancelling===true||!isProcessCancelled()||makeupBusy)&&(!(makeupBusy)||!makeupCancelled)&&<div className="studio-processing-overlay studio-wait-overlay"><section className="studio-processing-card studio-wait-card" style={{position:'relative'}} role="status" aria-live="polite" aria-busy="true"><div className="studio-wait-ring"><span className="studio-processing-spinner" aria-hidden="true"/><output>{Math.floor(Math.max(0,Math.min(100,displayProgress)))}%</output></div><ProcessingCloseButton disabled={processProgress.cancelling===true||displayProgress>=100} onClose={closeProcessing}/><h2>{processProgress.cancelling===true?'กำลังยกเลิกการประมวลผล…':makeupBusy?'กำลังปรับผิว':Number(processProgress.value)>=100?'ภาพพร้อมแล้ว':'กำลังประมวลผลรูปหน้าตรง…'}</h2><progress aria-label="สถานะการประมวลผล" max="100" value={displayProgress}/><p>{makeupBusy?'อาจใช้เวลาเก็บรายละเอียดสักพัก กรุณารอจนเสร็จ':<>กำลังรอผลลัพธ์<br/><strong>กรุณาอยู่หน้านี้จนกว่าจะเสร็จ</strong></>}</p></section></div>}{historyNotice&&<div className="studio-processing-overlay" style={{zIndex:31000}}><section className="studio-processing-card" role="dialog" aria-modal="true" aria-labelledby="studio-history-title" aria-busy={historyNotice.saving===true}><h2 id="studio-history-title">{historyNotice.kind==='reprocess'?'บันทึกงานเดิมก่อนประมวลผลใหม่ไหม?':'ประวัติการแก้ไข'}</h2><p>{historyNotice.kind==='reprocess'?'ประวัติย้อนกลับเก็บได้จำกัด บันทึกงานเดิมเป็นสำเนาเพื่อกลับมาแก้ไขภายหลัง แม้ประวัติเก่าถูกตัดออก':historyNotice.message}</p>{historyNotice.error&&<p role="alert">{historyNotice.error}</p>}<div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center',marginTop:20}}>{historyNotice.kind==='reprocess'?<><button disabled={historyNotice.saving} onClick={async()=>{setHistoryNotice(n=>({...n,saving:true,error:null}));if(await save({showPopup:false,createCopy:true})){setHistoryNotice(null);await processPhoto({continueWithoutSave:true})}else setHistoryNotice(n=>n?({...n,saving:false,error:'ยังบันทึกงานเดิมไม่สำเร็จ ลองบันทึกอีกครั้ง หรือเลือกประมวลผลต่อ'}):null)}}>บันทึกสำเนาแล้วประมวลผล</button><button disabled={historyNotice.saving} onClick={()=>{setHistoryNotice(null);void processPhoto({continueWithoutSave:true})}}>ประมวลผลต่อ</button><button disabled={historyNotice.saving} onClick={()=>setHistoryNotice(null)}>ยกเลิก</button></>:<><button onClick={()=>{setHistoryNotice(null);void save({createCopy:true})}}>บันทึกงานนี้เป็นสำเนา</button><button onClick={()=>{setHistoryNotice(null);onOpenSavedWorks?.()}}>เปิดงานที่บันทึก</button><button onClick={()=>{const back=historyNotice.pendingBack;setHistoryNotice(null);if(back)void history(true)}}>{historyNotice.pendingBack?'ย้อนกลับต่อ':'ตกลง'}</button></>}</div></section></div>}{portraitProcessError&&<div className="studio-processing-overlay" style={{zIndex:31000}}><section className="studio-processing-card" role="alertdialog" aria-modal="true" aria-labelledby="studio-process-error-title" aria-describedby="studio-process-error-message"><div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:14}}><h2 id="studio-process-error-title" style={{margin:0}}>ประมวลผลไม่สำเร็จ</h2><StudioPhotoGuide/></div><p id="studio-process-error-message">กรุณาตรวจสอบแสงและระยะภาพ ลองใหม่อีกครั้ง หรือเปลี่ยนรูป</p><div style={{display:"flex",gap:8,justifyContent:"center",marginTop:20}}><button disabled={assetBusy||processActive||!ready} onClick={()=>{setPortraitProcessError(null);photoInputRef.current?.click()}}>เลือกรูปใหม่</button><button autoFocus onClick={()=>setPortraitProcessError(null)}>ปิด</button></div></section></div>}{portraitChoiceOpen&&!easyMode&&<div className="studio-processing-overlay studio-portrait-choice-overlay" style={{zIndex:31000}} onClick={e=>{if(e.target===e.currentTarget)setPortraitChoiceOpen(false)}} onKeyDown={e=>{if(e.key==='Escape')setPortraitChoiceOpen(false)}}><section className="studio-processing-card studio-portrait-choice-card" role="dialog" aria-modal="true" aria-labelledby="studio-portrait-choice-title"><h2 id="studio-portrait-choice-title">กรุณาเลือกชนิดรูป</h2><div className="studio-portrait-choice-buttons">{[['female','รูปผู้หญิง'],['male','รูปผู้ชาย']].map(([mode,label],i)=><button key={mode} className="studio-portrait-choice-button" disabled={assetBusy||processActive||!ready} autoFocus={i===0} onClick={()=>{trackPhotoType(mode,'select');setPortraitMode(mode);setHairGender(mode);setEasyPhotoTypeSelected(true);setPortraitChoiceOpen(false);if(mode==='female'){setFemaleFinishChoiceOpen(true);return}if(sourcePhoto)sourcePhoto.idpromFemaleEyeStyle='natural';setProcessHairPending(true);setPicker('hair');setTouchLayersOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);setStatus('เลือกทรงผมเพื่อประมวลผลอัตโนมัติ')}}><span className="studio-portrait-choice-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M10 13a6 6 0 0 1 12 0v4a6 6 0 0 1-12 0v-4Z"/><path d="M5 29v-2c0-4 4-6 11-6s11 2 11 6v2"/>{mode==='female'?<path d="M7 23V12a9 9 0 0 1 18 0v11M10 13c4 0 6-2 7-5 1 3 3 4 5 5"/>:<path d="M10 12c1-4 6-5 12-2M10 13V9a6 6 0 0 1 12 0v4"/>}</svg></span><span>{label}</span><svg className="studio-portrait-choice-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 5 5 5-5 5"/></svg></button>)}</div></section></div>}{femaleFinishChoiceOpen&&!easyMode&&<div className="studio-processing-overlay studio-portrait-choice-overlay" style={{zIndex:31000}} onClick={e=>{if(e.target===e.currentTarget)setFemaleFinishChoiceOpen(false)}} onKeyDown={e=>{if(e.key==='Escape')setFemaleFinishChoiceOpen(false)}}><section className="studio-processing-card studio-portrait-choice-card studio-finish-choice-card" role="dialog" aria-modal="true" aria-labelledby="studio-female-finish-title"><h2 id="studio-female-finish-title">เลือกรูปแบบใบหน้า</h2><FemaleFaceCompare value={easyFaceFinish} disabled={!sourcePhoto||assetBusy||processActive} onSelect={style=>{if(!sourcePhoto)return;sourcePhoto.idpromFemaleEyeStyle=style;setEasyFaceFinish(style);setFemaleFinishChoiceOpen(false);setProcessHairPending(true);setPicker('hair');setTouchLayersOpen(false);setTouchMore(false);setTouchMenu(false);setToolRailOpen(true);setStatus('เลือกทรงผมเพื่อประมวลผลอัตโนมัติ')}}/></section></div>}{savePopup&&<div className="studio-processing-overlay" style={{zIndex:31000}}><section className="studio-processing-card" role="dialog" aria-modal="true" aria-labelledby="studio-save-title" aria-busy={savePopup.state==='saving'}>{savePopup.state==='saving'&&<span className="studio-processing-spinner" aria-hidden="true"/>}<h2 id="studio-save-title">{savePopup.title||(savePopup.state==='saving'?'กำลังบันทึก…':savePopup.state==='success'?'บันทึกเรียบร้อย':'บันทึกไม่สำเร็จ')}</h2><p role="status">{savePopup.message}</p>{savePopup.state!=='saving'&&<button autoFocus style={{marginTop:20}} onClick={()=>{const exit=savePopup.exitAfter;setSavePopup(null);if(exit)onClose(snapshot())}}>{savePopup.exitAfter?'กลับหน้าหลัก':'ตกลง'}</button>}</section></div>}<dialog ref={exitDialogRef} className="studio-exit-dialog" aria-labelledby="studio-exit-title" aria-describedby="studio-exit-message" onCancel={e=>{e.preventDefault();setExitPrompt(false)}}><h2 id="studio-exit-title">ดาวน์โหลดรูปก่อนออก</h2><p id="studio-exit-message">กรุณาดาวน์โหลดรูปลงอุปกรณ์ หากออกจากหน้าจะไม่สามารถเรียกคืนงานเดิมได้</p><div>{onSaveWork&&<button type="button" autoFocus className="studio-exit-save" onClick={async()=>{setExitPrompt(false);exitDialogRef.current?.close();if(await save({exitAfter:true})){setSavePopup(null);onClose(snapshot())}}}>บันทึกและออก</button>}<button type="button" onClick={()=>{setExitPrompt(false);exitDialogRef.current?.close();onClose(snapshot())}}>ออกจากหน้า</button><button type="button" onClick={()=>setExitPrompt(false)}>กลับไปใช้งาน</button></div></dialog></main>
}

































