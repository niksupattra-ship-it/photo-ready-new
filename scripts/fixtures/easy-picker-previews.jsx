import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EasyMode} from '../../src/easy-mode.jsx';
import {PRODUCTION_HAIR_CATALOG} from '../../hairstyle-catalog.js';
import {FREE_FEMALE_HAIR_OPTIONS} from '../../src/free-female-hair.js';
import uniforms from '../../src/uniform-picker-thumbnails.json' with {type:'json'};
import backgrounds from '../../src/background-picker-previews.json' with {type:'json'};
import '../../src/style.css';

const gender=new URLSearchParams(location.search).get('gender')||'female';
const hairs=[...PRODUCTION_HAIR_CATALOG.filter(h=>h.gender===gender&&!h.hidden&&h.interfaceLanguage!=='en'),...(gender==='female'?FREE_FEMALE_HAIR_OPTIONS:[])];
const templates=Object.keys(uniforms).map((template,index)=>({id:'suit-'+index,name:'ชุด '+index,group:'ข้าราชการ',template,preview:template}));
const options=Object.keys(backgrounds).map((src,index)=>({id:'background-'+index,name:'พื้นหลัง '+index,src}));
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
window.pickerFixture={hairs,templates,backgrounds:options,calls:[]};
function Fixture(){
 const [warmingPaused,setWarmingPaused]=useState(new URLSearchParams(location.search).has('manual'));
 window.pickerFixture.startWarmup=()=>setWarmingPaused(false);
 const canvasRef=useRef(null),[hair,setHair]=useState(''),[suit,setSuit]=useState(templates[0].template),[background,setBackground]=useState(options[0].id);
 const choose=(kind,option,update,value)=>{window.pickerFixture.calls.push({kind,option});update(value)};
 return <main className="idstudio"><EasyMode canvasRef={canvasRef} hasResult ready busy={warmingPaused} processing={false} sourcePreview={photo} gender={gender} hairs={hairs} selectedHair={hair} templates={templates} currentSuit={suit} backgrounds={options} currentBackground={background} onHair={id=>choose('hair',hairs.find(h=>h.id===id),setHair,id)} onSuit={option=>choose('suit',option,setSuit,option.template)} onBackground={option=>choose('background',option,setBackground,option.id)} onHome={()=>{}} onStudio={()=>{}}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
