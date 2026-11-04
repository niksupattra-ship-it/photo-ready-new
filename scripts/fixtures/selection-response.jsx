import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import source from '../../src/main.jsx?raw';
import '../../src/style.css';
const catalog=name=>Function(source.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))[0]+';return '+name)();
const suits=catalog('JOB_UNIFORMS').map(t=>({...t,name:t.title,preview:t.img,group:'สมัครงาน'}));
const png=color=>{const c=document.createElement('canvas');c.width=900;c.height=1200;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,c.width,c.height);return c.toDataURL()};
const bg=png('#9bd9f4'),head=png('#e8bc99');
window.selectionSnapshot={current:null};window.selectionCalls=[];
window.selectionCatalog={collar:catalog('COLLAR_PIN_OPTIONS'),chest:catalog('CHEST_PIN_OPTIONS'),ribbon:catalog('RIBBON_OPTIONS')};
createRoot(document.getElementById('root')).render(<StudioEditor initialEasy={location.search.includes('easy=1')} purchaseSnapshotRef={window.selectionSnapshot}
 initialLayers={[{name:'พื้นหลัง',kind:'background',source:bg},{name:'หัว · คอ · ผม',kind:'head',source:head,jobId:'fixture',restrictedTrial:false},{name:'ชุด',kind:'suit',source:png('#333366'),templatePath:suits[0].template,assetId:suits[0].id}]}
 placement={{W:900,H:1200,uX:0,uY:600,uW:900,uH:600,templatePath:suits[0].template}} templates={suits} freeTemplatePaths={suits.map(t=>t.template)}
 collarPins={catalog('COLLAR_PIN_OPTIONS')} chestPins={catalog('CHEST_PIN_OPTIONS')} ribbons={catalog('RIBBON_OPTIONS')} backgrounds={[]} maleHair={[]} femaleHair={[]}
 paidOutputIds={['fixture']} editableOutputIds={['fixture']} onVerifyOutput={async()=>({unlocked:true,fullEdit:true,paidDownload:true,premiumHair:true})}
 onSelectSuit={async()=>({limited:false,choices:[]})} onClose={()=>{}} paidHairAccess />);
