import React from 'react';
import './auto-hair-tile.css';

// Purely visual thumbnail for the automatic hairstyle choice.
// The parent button continues to own the existing onClick, selected state,
// generation policy, hairstyle ID and credit checks.
export function AutoHairTile({gender='female',english=false,selected=false,label}) {
 const male=gender==='male';
 const caption=label||(english?'AI Picks':'AI เลือกให้');
 return <div className={'auto-hair-tile '+(male?'auto-hair-tile--male':'auto-hair-tile--female')+(selected?' is-selected':'')} aria-hidden="true">
  <svg className="auto-hair-avatar" viewBox="0 0 112 90" focusable="false" fill="none">
   <g stroke="#4a208f" strokeWidth="2.65" strokeLinecap="round" strokeLinejoin="round">
    {/* Simple monochrome portrait: no filled-in skin, hair or clothes. */}
    {male?<>
     <path d="M39 34 Q34 20 44 15 Q49 8 59 12 Q72 10 77 20 Q83 24 78 35"/>
     <path d="M39 31 Q48 30 56 23 Q64 29 76 28"/>
    </>:<>
     <path d="M38 39 Q32 21 42 15 Q51 7 62 12 Q77 13 77 37 L77 53 Q73 60 67 61"/>
     <path d="M37 36 Q43 36 49 30 Q57 26 60 21 Q67 31 75 35"/>
     <path d="M38 47 Q31 46 29 53 Q26 60 32 62 Q38 63 41 56"/>
    </>}
    <path d="M39 36 L39 44 Q40 56 56 60 Q72 56 73 44 L73 36"/>
    <path d="M39 39 Q35 36 35 41 Q35 46 40 47 M73 39 Q77 36 77 41 Q77 46 72 47"/>
    <path d="M49 59 L49 65 M63 59 L63 65"/>
    <path d="M49 65 L56 73 L63 65"/>
    <path d="M48 63 L36 68 Q28 71 26 80 M64 63 L76 68 Q84 71 86 80"/>
    <path d="M47 64 L40 70 L47 81 M65 64 L72 70 L65 81"/>
    <path d="M56 74 L56 81"/>
   </g>
   {/* Subtle AI motion lines and tiny sparkles, in the same purple. */}
   <g stroke="#7439d3" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 64 Q16 70 27 77" />
    <path d="M88 36 Q96 45 91 54" />
    <path d="M20 27 L20 34 M16.5 30.5 L23.5 30.5"/>
    <path d="M92 17 L92 25 M88 21 L96 21"/>
   </g>
   <circle cx="86" cy="69" r="10" fill={selected?'#742ee0':'#fff'} stroke="#6326c2" strokeWidth="2"/>
   <path d="m81.5 69 3 3 6-7" stroke={selected?'#fff':'#6326c2'} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
  <div className="auto-hair-label">
   <svg className="auto-hair-wand" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none">
    <path d="M3.5 16.5 12.5 7.5" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round"/>
    <path d="M14.5 2v4M12.5 4h4M16.5 11v3M15 12.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
   </svg><span>{caption}</span>
  </div>
 </div>;
}
