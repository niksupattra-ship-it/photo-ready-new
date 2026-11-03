// Long-lived caching is restricted to versioned public files. This function is
// passed only to express.static, never to authenticated/API responses.
export function publicAssetHeaders(res,file){
 if(/\.html?$/i.test(file)){res.setHeader('Cache-Control','no-cache');return}
 const built=/[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(file);
 const contentAddressedImage=/[\\/]assets[\\/](?:[^\\/]+[\\/])*[^\\/]+\.[a-f0-9]{12}\.(?:webp|png|jpg|avif)$/.test(file);
 if(built||contentAddressedImage)res.setHeader('Cache-Control','public, max-age=31536000, immutable');
}
