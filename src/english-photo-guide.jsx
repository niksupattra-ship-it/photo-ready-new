import React from 'react';
export function EnglishPhotoGuide(){
 return <div className="english-photo-guide" lang="en">
  <h2>Photo preparation guide</h2>
  <p>Use a clear, front-facing portrait for the best processing results.</p>
  <div className="english-photo-guide-body">
   <figure><img src="/assets/home-previews/easy-original-v20261031.webp" alt="Example of a well-lit, front-facing portrait with the head and upper body visible"/><figcaption>Recommended: face forward, with the head, shoulders and upper body in view.</figcaption></figure>
   <section><h3>Avoid these photos</h3><ul>
    <li>Extreme close-ups that crop the head or chin</li><li>Distant or full-length photos in which the face is too small</li><li>Side-facing photos or a tilted head</li><li>Seated poses that obscure the upper body</li><li>A face positioned near the edge of the image</li><li>Dim lighting, heavy shadows, blur or facial obstructions</li>
   </ul><p>Allow space around the head and shoulders. Review the processed result before paying or downloading.</p></section>
  </div>
 </div>;
}
