import React from 'react';
import './auto-hair-tile.css';

// Visual-only AI hairstyle choice: parent controls gender, selection and all behavior.
export function AutoHairTile({gender='female',english=false,selected=false,label}) {
 const male=gender==='male';
 return <div className={'auto-hair-tile '+(male?'auto-hair-tile--male':'auto-hair-tile--female')+(selected?' is-selected':'')} aria-hidden="true">
  <img className="auto-hair-modern-image" src={'/assets/auto-hair/modern-'+(male?'male':'female')+'.svg?v=2'} alt="" loading="lazy" draggable="false"/>
  {selected&&<div className="auto-hair-selection-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.3 4.3L19 6.5" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>}
 </div>;
}
