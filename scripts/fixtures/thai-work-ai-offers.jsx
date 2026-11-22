import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PackageOffers} from '../../src/package-offers.jsx';
const query=new URLSearchParams(location.search);window.offerActions={checkout:[],studio:0};
function Fixture(){const[studio,setStudio]=useState(query.get('studio')==='1');return <PackageOffers studioMode={studio} preview="/assets/government-uniforms/female-operational-example.jpg" hasTrial={query.get('ready')!=='0'} onOpenStudio={()=>{offerActions.studio++;setStudio(true)}} startCheckout={id=>offerActions.checkout.push(id)} onBackToPhoto={()=>{}}/>}
createRoot(document.getElementById('root')).render(<Fixture/>);
