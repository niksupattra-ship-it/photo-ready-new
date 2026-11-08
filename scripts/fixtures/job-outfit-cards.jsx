import React from 'react';
import {createRoot} from 'react-dom/client';
import {StudioEditor} from '../../src/studio-editor.jsx';
import {startEnglishPreview,outfitsForLanguage,translateEnglish} from '../../src/english-preview.js';
import source from '../../src/main.jsx?raw';
import '../../src/style.css';

const catalog=name=>Function(source.match(new RegExp('const '+name+'=\\[[\\s\\S]*?\\n\\];'))[0]+';return '+name)();
const jobs=catalog('JOB_UNIFORMS').map(item=>({...item,name:item.title,preview:item.img,group:'สมัครงาน'}));
const government=catalog('INTERIOR_UNIFORMS').slice(0,1).map(item=>({...item,template:item.img,preview:item.preview||item.img,group:'ข้าราชการ',cat:'government',gender:'male'}));
const options=outfitsForLanguage([...jobs,...government]);
const mode=new URLSearchParams(location.search).get('gender')||'male';
const first=jobs.find(item=>item.gender===mode)||jobs[0];
const png=color=>{const c=document.createElement('canvas');c.width=900;c.height=1200;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c.toDataURL()};
window.outfitCardSnapshot={current:null};
const label=value=>new URLSearchParams(location.search).get('lang')==='en'?translateEnglish(value):value;
window.outfitCardOptions=options.map(item=>({...item,choiceLabel:label(item.name),studioLabel:label('เลือกชุด '+item.name)}));
window.outfitCardGender=mode;
startEnglishPreview();
createRoot(document.getElementById('root')).render(<StudioEditor initialEasy={location.search.includes('easy=1')} purchaseSnapshotRef={window.outfitCardSnapshot}
 initialLayers={[{name:'พื้นหลัง',kind:'background',source:png('#9bd9f4')},{name:'หัว · คอ · ผม',kind:'head',source:png('#e8bc99'),jobId:'fixture',portraitMode:mode,restrictedTrial:false},{name:'ชุด',kind:'suit',source:png('#333366'),templatePath:first.template,assetId:first.id}]}
 placement={{W:900,H:1200,uX:0,uY:600,uW:900,uH:600,templatePath:first.template}} templates={options} freeTemplatePaths={options.map(item=>item.template)}
 collarPins={[]} chestPins={[]} ribbons={[]} backgrounds={[]} maleHair={[]} femaleHair={[]}
 paidOutputIds={['fixture']} editableOutputIds={['fixture']} onVerifyOutput={async()=>({unlocked:true,fullEdit:true,paidDownload:true,premiumHair:true})}
 onSelectSuit={async()=>({limited:false,choices:[]})} onClose={()=>{}} paidHairAccess />);
