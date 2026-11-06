import React from 'react';
import {createRoot} from 'react-dom/client';
import {PHOTO_SIZES,photoSizesForLanguage,PhotoSizeEditor,cropPhotoForDownload} from '../../src/photo-size.jsx';
import {HomePhotoSizes} from '../../src/home-photo-sizes.jsx';
import {startEnglishPreview} from '../../src/english-preview.js';
import '../../src/style.css';
const canvas=Object.assign(document.createElement('canvas'),{width:900,height:1200});
const ctx=canvas.getContext('2d');ctx.fillStyle='#dca58b';ctx.fillRect(0,0,900,1200);
canvas.toBlob(blob=>{
 window.sizeFixture={blob,cropPhotoForDownload,presets:photoSizesForLanguage(),thai:PHOTO_SIZES};
 createRoot(document.getElementById('root')).render(<><HomePhotoSizes sample={{img:'/assets/home-previews/job-uniforms--female-formal-suit-example.webp'}} onStart={()=>{}}/><PhotoSizeEditor embedded blob={blob} value={{sizeId:'1-inch',x:.5,y:.5,zoom:1}} pixelScale={2}/></>);
 startEnglishPreview();
});
