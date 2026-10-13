import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {longHairWarpTarget} from './src/long-hair-two-layer-fit.js';
const editor=fs.readFileSync(new URL('./src/studio-editor.jsx',import.meta.url),'utf8');
function controls(touch=false){
 const layers=[{id:'head',kind:'head',name:'หัว',visible:true},{id:'badge',name:'เข็ม',visible:true}];
 const ctx={touch,brushSession:{current:null},state:{current:layers},selectedRef:{current:'head'},hydratingRef:{current:false},ready:true,assetBusy:false,processActive:false,comparing:false,desktopLayersRef:{current:{scrollIntoView:()=>{}}},longHairWarpTarget,clearTouchSelection:()=>{ctx.selectedRef.current=null},setStatus:s=>ctx.status=s};
 for(const key of ['Tool','BrushLayerRequired','Selected','TouchLayersOpen','LayerGuide','ToolRailOpen','Picker','Cursor','TouchMore','TouchOpen','TouchMenu','TouchSide'])ctx['set'+key]=v=>{ctx[key]=v};
 const start=editor.indexOf(' const choosePart='),end=editor.indexOf(' const pickerDrawerRef=',start);
 const run=vm.runInNewContext(editor.slice(start,end)+'\n({choosePart,chooseCanvasTool})',ctx);return {ctx,run,layers};
}
for(const touch of [false,true])for(const tool of ['erase','warp'])test(`${tool} requires a new layer choice and retains it through the move button, touch=${touch}`,()=>{
 const f=controls(touch);f.run.chooseCanvasTool(tool);assert.equal(f.ctx.Tool,tool);assert.equal(f.ctx.BrushLayerRequired,true);assert.equal(f.ctx.brushSession.current.awaitingLayer,true);assert.equal(f.ctx.brushSession.current.layerId,null);
 f.run.choosePart('head');assert.equal(f.ctx.Tool,tool);assert.equal(f.ctx.BrushLayerRequired,false);assert.equal(f.ctx.selectedRef.current,'head');
 f.run.choosePart('badge');assert.equal(f.ctx.Tool,tool);assert.equal(f.ctx.brushSession.current.layerId,'badge');assert.equal(f.ctx.selectedRef.current,'badge');
 f.run.chooseCanvasTool('move');assert.equal(f.ctx.Tool,'move');assert.equal(f.ctx.selectedRef.current,'badge');assert.equal(f.ctx.brushSession.current,null);assert.equal(f.ctx.TouchLayersOpen,false);
 f.run.choosePart('head');assert.equal(f.ctx.Tool,'move');f.run.chooseCanvasTool(tool);assert.equal(f.ctx.BrushLayerRequired,true);assert.equal(f.ctx.brushSession.current.awaitingLayer,true);
});
test('not choosing, hidden and locked layers do not satisfy mandatory brush selection',()=>{
 const f=controls(true);f.run.chooseCanvasTool('erase');f.run.choosePart(null);assert.equal(f.ctx.brushSession.current.awaitingLayer,true);
 for(const patch of [{locked:true},{visible:false}]){Object.assign(f.layers[0],{locked:false,visible:true},patch);f.run.choosePart('head');assert.equal(f.ctx.brushSession.current.awaitingLayer,true);assert.equal(f.ctx.BrushLayerRequired,true)}
});
test('long-hair warp selection keeps the matching rear layer when switching back to move',()=>{
 const f=controls(true),front={id:'front',kind:'hair-preview',hairRole:'front',hairId:'hair-02',hairHeadId:'head',visible:true},back={...front,id:'back',hairRole:'back'};f.layers.push(back,front);
 f.run.chooseCanvasTool('warp');f.run.choosePart('front');assert.equal(f.ctx.Tool,'warp');assert.equal(f.ctx.selectedRef.current,'back');assert.equal(f.ctx.brushSession.current.layerId,'back');
 f.run.chooseCanvasTool('move');assert.equal(f.ctx.selectedRef.current,'back');assert.equal(f.ctx.Tool,'move');
});
test('automatic move requests cannot end a brush session; explicit move can',()=>{
 const f=controls();f.ctx.setToolState=v=>f.ctx.Tool=v;
 const start=editor.indexOf(' const setTool=id=>'),end=editor.indexOf('\n',start);
 const setTool=vm.runInNewContext(editor.slice(start,end)+'\nsetTool',f.ctx);f.ctx.setTool=setTool;
 f.run.chooseCanvasTool('erase');f.run.choosePart('head');setTool('move');assert.equal(f.ctx.Tool,'erase');setTool('pan');assert.equal(f.ctx.Tool,'erase');f.run.chooseCanvasTool('move');assert.equal(f.ctx.Tool,'move');
});

for(const touch of [false,true])test(`collar tool explicitly ends the brush session, touch=${touch}`,()=>{
 const f=controls(touch);f.run.chooseCanvasTool('erase');f.run.choosePart('head');assert.equal(f.run.chooseCanvasTool('neck'),false);assert.equal(f.ctx.brushSession.current,null);assert.equal(f.ctx.BrushLayerRequired,false);f.run.chooseCanvasTool('erase');assert.equal(f.ctx.brushSession.current.awaitingLayer,true);
});
