import React from 'react';
export function EnglishPhotoGuide(){
 return <div className="english-photo-guide" lang="en">
  <h2>Photo guide</h2>
  <p>Use a clear, well-lit, front-facing photo.</p>
  <div className="english-photo-guide-body">
   <figure><img src="/assets/home-previews/easy-original-v20261031.webp" alt="Example of a well-lit, front-facing portrait with the head and upper body visible"/><figcaption>Face forward. Keep your full head, shoulders and upper chest in view.</figcaption></figure>
   <section><h3>Avoid</h3><ul>
    <li>Extreme close-ups that crop the head or chin</li><li>Distant or full-body photos with a small face</li><li>Side views or a tilted head</li><li>Photos that hide the neck or shoulders</li><li>Faces too close to the image edge</li><li>Dark or blurry photos, strong shadows, or an obscured face</li>
   </ul><p>Leave space around your head and shoulders. Check the result before paying or downloading.</p></section>
  </div>
 </div>;
}
