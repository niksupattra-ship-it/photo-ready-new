import React from 'react';
export const ENGLISH_EXAMPLE_SHEET='/assets/english-examples/professional-portraits-v1.webp';
const panels={'female-suit-03':0,'female-suit-04':1,'male-suit-03':2,'female-formal-suit':3,'female-lapel-suit':4,original:5};
// Display-only generated stock models. Production outfit references and
// uploaded customers' faces never use these demonstration images.
const suppliedExamples={
 'original-v2':'/assets/english-examples/english-example-original-v2.webp',
 'natural-v2':'/assets/english-examples/english-example-natural-v2.webp',
 'makeup-v2':'/assets/english-examples/english-example-makeup-v2.webp'
};
export function EnglishExamplePhoto({id,alt}){
 if(suppliedExamples[id])return <span className="english-example-photo" role="img" aria-label={alt} data-example={id}><img src={suppliedExamples[id]} alt="" loading="lazy" decoding="async"/></span>;
 const panel=panels[id]??0,col=panel%3,row=Math.floor(panel/3);
 return <span className="english-example-photo" role="img" aria-label={alt} data-example={id}><svg aria-hidden="true" viewBox={`${col+.004} ${row*1.5+.004} .992 1.492`} preserveAspectRatio="xMidYMin slice"><image href={ENGLISH_EXAMPLE_SHEET} x="0" y="0" width="3" height="3"/></svg></span>;
}
