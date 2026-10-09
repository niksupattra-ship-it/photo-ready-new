import React from 'react';
const TOOLS=new Set(['neck','layers','none','layer-up','layer-down','layer-copy','move','transform','pan','warp','erase','restore','undo','redo','compare','upload','process','warp-push','warp-shrink','warp-expand','warp-clockwise','warp-counterclockwise']);
const CHOICES=new Set(['suit','hair','collar','chest','ribbon','background']);
const SVG_TOOLS=new Set(['move','pan','neck','warp','erase','restore','warp-push','warp-shrink','warp-expand']);
function Icon({kind,allowed}){return allowed.has(kind)?<img className={'studio-png-icon'+(kind==='pan'?' studio-pan-icon':'')} src={`/assets/studio-icons/${kind}.${SVG_TOOLS.has(kind)?'svg':'png'}?v=242`} width="64" height="64" alt="" aria-hidden="true" draggable="false"/>:null;}
export function StudioToolIcon({kind}){return <Icon kind={kind} allowed={TOOLS}/>;}
export function StudioChoiceIcon({kind}){if(kind==='makeup')return <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" className="studio-lipstick-icon"><path fill="#ef83ad" d="M24 31V14c0-4 16-13 16-7v24z"/><path fill="#fff1f6" d="M24 28h16v12H24z"/><path fill="#62d8cd" d="M19 38h26v22H19z"/><path fill="#163b43" d="M19 50h26v4H19z"/><path fill="#ffbdd4" d="M27 16v13h3V14z"/></svg>;return <Icon kind={kind} allowed={CHOICES}/>;}
