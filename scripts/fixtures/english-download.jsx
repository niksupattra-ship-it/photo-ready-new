import React from 'react';
import {createRoot} from 'react-dom/client';
import {PurchaseReceipt} from '../../src/purchase-delivery.jsx';
import {startEnglishPreview} from '../../src/english-preview.js';
import '../../src/style.css';
const image=new Image();image.src='/assets/face-finish/natural.webp';await image.decode();const c=document.createElement('canvas');c.width=900;c.height=1200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,900,1200);x.drawImage(image,0,0,900,1200);
const blob=await new Promise(r=>c.toBlob(r));window.downloadFixture={archives:[],closed:false};
createRoot(document.getElementById('root')).render(<PurchaseReceipt receipt={{blob,sourceBlob:blob,receiptKey:'authorized-fixture',name:'portrait.png',crop:{sizeId:'original',x:.5,y:.5,zoom:1},pixelScale:2}} onClose={()=>{downloadFixture.closed=true}} onPrepareSize={async crop=>{downloadFixture.archives.push(crop)}} onHistory={()=>{}} onRetry={()=>{}}/>);
startEnglishPreview();
