import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThaiMobileJourney} from '../../src/thai-mobile-journey.jsx';
import {StudioImageProcessing} from '../../src/studio-image-processing.jsx';
import '../../src/style.css';
const source='/assets/home-previews/easy-original-v20261031.webp';
function Fixture(){const [value,setValue]=useState(37),stage=useRef(),canvas=useRef();useEffect(()=>{window.changeScanProgress=setValue;window.scanCancels=0;const im=new Image();im.onload=()=>{canvas.current.getContext('2d').drawImage(im,0,0,300,400)};im.src=source},[]);const cancel=()=>window.scanCancels++;
return <main className="idstudio">{location.search.includes('studio')?<div ref={stage} className="studio-stage" style={{width:300,height:400,margin:'24px auto'}}><canvas ref={canvas} width="300" height="400"/><StudioImageProcessing stageRef={stage} canvasRef={canvas} progress={value} title="กำลังประมวลผลรูป" description="กำลังสร้างรูป" onCancel={cancel}/></div>:<><canvas ref={canvas} hidden width="300" height="400"/><ThaiMobileJourney sourcePreview={source} canvasRef={canvas} processing progress={value} onCancelProcess={cancel}/></>}</main>}
createRoot(document.getElementById('root')).render(<Fixture/>);
