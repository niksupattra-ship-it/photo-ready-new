import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile('src/studio-editor.jsx','utf8'),a=source.indexOf(' const createPaintLayer=async()=>{'),b=source.indexOf(' const chooseCanvasTool=',a),c=source.indexOf(' const selectEditorTool=',b);
assert(a>=0&&b>a&&c>b);
const build=env=>Function('env',`with(env){${source.slice(a,c)};return {createPaintLayer,chooseCanvasTool}}`)(env);
function fixture({count=3,ok=true,pending=false}={}){
 const original=Array.from({length:count},(_,i)=>({id:'original-'+i,kind:i?'suit':'head',source:'unchanged-'+i})),calls=[],messages=[];const noop=()=>{};
 const env={state:{current:original},paintLayerPendingRef:{current:pending},hydratingRef:{current:false},ready:true,assetBusy:false,processActive:false,comparing:false,touch:false,
  setStatus:m=>messages.push(m),setAssetBusy:v=>{env.assetBusy=v},flushTransforms:noop,historySnapshot:()=>original.slice(),nativeCanvas:()=>{calls.push('canvas');return{width:2256,height:3072}},fresh:l=>({id:'new-paint',visible:true,locked:false,...l}),W:900,H:1200,
  hydrate:async(next,ids)=>{calls.push({next,ids});if(ok)env.state.current=next;return ok},undo:{current:[]},redo:{current:['old-redo']},historyTruncatedRef:{current:false},historyBoundaryNoticeRef:{current:false},brushSession:{current:{tool:'erase',layerId:'original-0'}},selectedRef:{current:'original-0'},desktopLayersRef:{current:null},
  setBrushLayerRequired:noop,setTool:tool=>calls.push(tool),setSelected:noop,setCursor:noop,setLayerGuide:noop,setTouchLayersOpen:noop,setToolRailOpen:noop,setPicker:noop,setTouchMore:noop,setTouchOpen:noop,setTouchMenu:noop,setRightPanelCollapsed:noop,setInspectorSection:noop,setRevision:noop};
 return {env,original,calls,messages,...build(env)};
}
const f=fixture();await f.createPaintLayer();assert.equal(f.env.state.current.length,4);const layer=f.env.state.current.at(-1);assert.equal(layer.kind,'paint');assert.deepEqual(layer.sourceFrame,{x:0,y:0,w:900,h:1200});assert.equal(layer.source.width,2256);assert.equal(layer.source.height,3072);assert.equal(layer.jobId,undefined);assert.equal(f.env.brushSession.current.layerId,layer.id);assert.equal(f.env.brushSession.current.awaitingLayer,false);assert.equal(f.env.selectedRef.current,layer.id);assert.equal(f.env.undo.current.length,1);assert.equal(f.env.redo.current.length,0);assert.deepEqual(f.env.state.current.slice(0,3),f.original);assert.equal(f.env.paintLayerPendingRef.current,false);assert.equal(f.env.assetBusy,false);
const failure=fixture({ok:false});await failure.createPaintLayer();assert.equal(failure.env.state.current,failure.original);assert.equal(failure.env.undo.current.length,0);assert.equal(failure.env.brushSession.current.tool,'erase');assert.equal(failure.env.paintLayerPendingRef.current,false);
const pending=fixture({pending:true});await pending.createPaintLayer();assert.equal(pending.calls.length,0);
const full=fixture({count:20});assert.equal(full.chooseCanvasTool('paint'),true);assert.equal(full.env.state.current.length,20);assert.equal(full.calls.includes('canvas'),false);assert.equal(full.env.brushSession.current.tool,'paint');assert.equal(full.env.brushSession.current.awaitingLayer,true);assert(full.messages[0].includes('20'));
console.log('PASS actual paint creation preserves original layers, creates a separate native-size transparent canvas, records undo only after success, blocks duplicate in-flight creation, and retains existing-layer painting when the 20-layer limit is reached. No services or AI.');
