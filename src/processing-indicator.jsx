import React from 'react';
import './processing-indicator.css';

// Uses supplied, stage-derived progress. Never estimates completion on a timer.
export function ProcessingIndicator({value=0}){
 const safe=Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.floor(Number(value)))):0;
 return <div className="idprom-process-indicator" style={{'--idprom-progress':safe+'%'}} aria-label={safe+'%'}><output>{safe}<small>%</small></output></div>;
}
