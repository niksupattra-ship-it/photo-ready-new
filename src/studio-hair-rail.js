const motions=new WeakMap();
export function stopHairRail(rail){const m=rail&&motions.get(rail);if(!m)return;cancelAnimationFrame(m.frame);rail.style.scrollBehavior=m.behavior;rail.style.scrollSnapType=m.snap;motions.delete(rail)}
export function stepHairRail(rail,direction){
 if(!rail)return;const cards=[...rail.children].filter(el=>el.tagName==='BUTTON');
 const step=cards.length>1?Math.abs(cards[1].getBoundingClientRect().left-cards[0].getBoundingClientRect().left):cards[0]?.getBoundingClientRect().width;if(!(step>0))return;
 const prior=motions.get(rail),max=Math.max(0,rail.scrollWidth-rail.clientWidth),target=Math.max(0,Math.min(max,(prior?prior.target:rail.scrollLeft)+direction*step));
 stopHairRail(rail);const start=rail.scrollLeft,at=performance.now(),m={target,frame:0,behavior:rail.style.scrollBehavior,snap:rail.style.scrollSnapType};motions.set(rail,m);rail.style.scrollBehavior='auto';rail.style.scrollSnapType='none';
 const frame=now=>{const t=Math.min(1,(now-at)/220),ease=1-(1-t)**3;rail.scrollLeft=start+(target-start)*ease;if(t<1)m.frame=requestAnimationFrame(frame);else stopHairRail(rail)};m.frame=requestAnimationFrame(frame);
}
export function restoreHairRail(rail,fallback=0){
 if(!rail)return;stopHairRail(rail);const active=rail.querySelector('button[aria-pressed="true"]'),bounds=rail.getBoundingClientRect();
 const target=active?rail.scrollLeft+active.getBoundingClientRect().left-bounds.left-(rail.clientWidth-active.getBoundingClientRect().width)/2:fallback;
 const old=rail.style.scrollBehavior;rail.style.scrollBehavior='auto';rail.scrollLeft=Math.max(0,Math.min(Math.max(0,rail.scrollWidth-rail.clientWidth),target));rail.style.scrollBehavior=old;
}
