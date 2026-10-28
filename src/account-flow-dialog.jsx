import React,{useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import './account-flow-dialog.css';

// Account and checkout surfaces share the browser's modal layer. A z-index
// cannot escape editor stacking contexts or cover another native dialog.
export function AccountFlowDialog({open=true,onClose,busy=false,label,initialFocus,children}){
 const panel=useRef(null),callbacks=useRef({onClose,busy});
 callbacks.current={onClose,busy};
 useLayoutEffect(()=>{
  if(!open)return;
  const dialog=panel.current,previous=document.activeElement;
  dialog.showModal();
  return()=>{
   const ownedFocus=dialog.contains(document.activeElement)||document.activeElement===document.body;
   dialog.close();
   if(ownedFocus&&previous?.isConnected)previous.focus?.({preventScroll:true});
  };
 },[open]);
 useLayoutEffect(()=>{
  if(open&&initialFocus)panel.current.querySelector(initialFocus)?.focus({preventScroll:true});
 },[open,initialFocus]);
 return createPortal(<dialog ref={panel} className="idprom-account-flow-dialog" aria-label={label} onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation()}} onCancel={e=>{e.preventDefault();e.stopPropagation();if(!callbacks.current.busy)callbacks.current.onClose?.()}}>{children}</dialog>,document.body);
}
