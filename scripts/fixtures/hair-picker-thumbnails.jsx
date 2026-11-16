import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CatalogPreview} from '../../src/studio-editor.jsx';
import {PRODUCTION_HAIR_CATALOG,HAIR_DESIGN_VERSION} from '../../hairstyle-catalog.js';
import {FREE_FEMALE_HAIR_OPTIONS} from '../../src/free-female-hair.js';
const params=new URLSearchParams(location.search),gender=params.get('gender')||'female',english=params.get('lang')==='en';
const choices=PRODUCTION_HAIR_CATALOG.filter(h=>h.gender===gender&&!h.hidden&&(english?h.interfaceLanguage==='en':h.interfaceLanguage!=='en'));
if(!english&&gender==='female')choices.push(...FREE_FEMALE_HAIR_OPTIONS);
window.hairFixture={choices,selected:null};
function Fixture(){
 const [opened,setOpened]=useState(false);
 return <><button id="toggle-hair" onClick={()=>setOpened(value=>!value)}>Toggle hair</button>{opened&&<div id="hair-scroll" style={{width:232,height:650,maxHeight:'calc(100vh - 60px)',overflow:'auto'}}><div id="hair-grid" style={{display:'grid',gridTemplateColumns:'repeat(2,100px)',gap:16}}>{choices.map((h,i)=><button data-hair-id={h.id} key={h.id} onClick={()=>{window.hairFixture.selected={id:h.id,source:h.src}}} style={{width:100,height:100,padding:0,overflow:'hidden'}}><CatalogPreview src={h.src+(h.id.startsWith('seedream-')?'?hair='+encodeURIComponent(HAIR_DESIGN_VERSION):'')} eager={i<4} maleHair={gender==='male'} englishHair={english}/></button>)}</div></div>}</>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
