import React from 'react';
const TOOLS=new Set(['neck','layers','none','layer-up','layer-down','layer-copy','move','transform','pan','warp','erase','restore','undo','redo','compare','upload','process','warp-push','warp-shrink','warp-expand','warp-clockwise','warp-counterclockwise']);
const CHOICES=new Set(['suit','hair','collar','chest','ribbon','background']);
function Icon({kind,allowed}){return allowed.has(kind)?<img className="studio-png-icon" src={`/assets/studio-icons/${kind}.png?v=164`} width="64" height="64" alt="" aria-hidden="true" draggable="false"/>:null;}
export function StudioToolIcon({kind}){return <Icon kind={kind} allowed={TOOLS}/>;}
export function StudioChoiceIcon({kind}){return <Icon kind={kind} allowed={CHOICES}/>;}
