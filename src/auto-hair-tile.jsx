import React from 'react';
import './auto-hair-tile.css';

// Display-only thumbnail. The parent button retains its existing hair ID,
// default-reference selection, credit checks, and onClick behavior.
export function AutoHairTile({gender='female',english=false,selected=false,label}) {
 const male=gender==='male';
 const caption=label||(english?'Auto Select':'ระบบเลือกให้');
 return <div className={'auto-hair-tile '+(male?'auto-hair-tile--male':'auto-hair-tile--female')+(selected?' is-selected':'')} aria-hidden="true">
  <svg className="auto-hair-avatar" viewBox="0 0 112 100" focusable="false">
   <path d="M27 92Q28 79 38 77L47 73 56 77 65 73 74 77Q85 81 87 92Z" fill={male?'#203565':'#d8cff6'}/>
   <path d="M46 73 56 88 66 73" fill="#fff" stroke="#d6cef1" strokeWidth="1.8" strokeLinejoin="round"/>
   {male&&<path d="M53 83 59 83 63 98 49 98Z" fill="#273b72"/>}
   {!male&&<><ellipse cx="32" cy="63" rx="9" ry="15" fill="#253a75"/><ellipse cx="80" cy="63" rx="9" ry="15" fill="#253a75"/><path d="M33 48Q30 17 56 13 84 17 79 49L75 60 36 60Z" fill="#1b2d65"/></>}
   {male&&<path d="M31 48Q24 23 41 19 45 7 57 13 73 7 80 22 89 29 82 48L77 60 36 59Z" fill="#1b2d65"/>}
   <path d="M40 42Q47 34 56 37 65 34 72 42L72 62Q67 77 56 79 45 77 40 62Z" fill="#fff" stroke="#6573ab" strokeWidth="1.8"/>
   {male?<path d="M36 44Q33 33 42 30 47 21 62 24 72 21 79 34L74 43Q66 34 60 32 47 40 36 44Z" fill="#1b2d65"/>:
   <><path d="M35 47Q37 25 56 23L56 26Q48 43 39 45Z" fill="#1b2d65"/><path d="M77 47Q75 25 56 23L56 26Q64 43 73 45Z" fill="#1b2d65"/><path d="M56 23V29" stroke="#5870ab" strokeWidth="1.4"/></>}
   <path d="M29 81 25 75M81 79 87 74" stroke="#d8b34a" strokeWidth="2" strokeLinecap="round"/>
   <path d="M15 38v9m-4-4h8M92 28v8m-4-4h8" fill="none" stroke="#ffc846" strokeWidth="2.5" strokeLinecap="round"/>
   {selected&&<><circle cx="83" cy="76" r="14" fill="#8139e8" stroke="#fff" strokeWidth="3"/><path d="m76 76 5 5 10-11" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></>}
  </svg>
  <div className="auto-hair-label"><svg className="auto-hair-wand" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 16 13 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M12.7 3V1M12.7 9v2M9 6H7M16.8 6h2M16 3l1.4-1.4M9.5 3 8 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><span>{caption}</span></div>
 </div>;
}
