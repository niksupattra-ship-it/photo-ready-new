// Server-side English entry page for /en/.
// Uses the same built React app as Thai; does not alter Thai HTML or payment APIs.
export const ENGLISH_LANDING_URL='https://idpromth.com/en/';
const TITLE='Professional ID Photos & Job Application Portraits Online | IDProm';
const DESCRIPTION='Create professional ID photos and job application portraits online. Upload a clear front-facing photo, choose outfits and hairstyles, preview your result, and download PNG or PDF after purchase.';
const URL=ENGLISH_LANDING_URL;
function once(source,replacementPattern,replacement,label){
 const flags=replacementPattern.flags.includes('g')?replacementPattern.flags:replacementPattern.flags+'g';
 const matches=[...source.matchAll(new RegExp(replacementPattern.source,flags))];
 if(matches.length!==1)throw Error('English SEO entry mismatch: '+label);
 return source.replace(replacementPattern,replacement);
}
function meta(html,attribute,name,value){
 const pattern=new RegExp('(<meta '+attribute+'="'+name+'" content=")[^"]*(")');
 return once(html,pattern,(_all,start,end)=>start+value+end,name);
}
const ENGLISH_CONTENT=[
 '<section class="idprom-seo" aria-labelledby="idprom-seo-title">',
 '  <div class="idprom-howto">',
 '    <header class="idprom-howto-head">',
 '      <div>',
 '        <span class="idprom-howto-eyebrow">Professional portraits made simple</span>',
 '        <h2 id="idprom-seo-title">Create Professional ID and Job Application Photos Online</h2>',
 '        <p>Upload your front-facing photo, choose a professional outfit and hairstyle, and adjust the background. Preview your portrait before deciding whether to purchase.</p>',
 '      </div>',
 '    </header>',
 '    <div class="idprom-steps" aria-label="How to create your professional photo">',
 '      <div class="idprom-step"><span class="idprom-step-num">01</span><strong>Upload your photo</strong><span>Use a well-lit, front-facing image with your face clearly visible.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">02</span><strong>Choose your style</strong><span>Select an outfit and background, then create your portrait with AI.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">03</span><strong>Review your portrait</strong><span>Check the preview and refine your image in Studio before purchasing.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">04</span><strong>Download your photo</strong><span>Choose a photo size and save PNG or PDF after unlocking.</span></div>',
 '    </div>',
 '    <p class="idprom-seo-note">Photo requirements vary by employer, institution and country. Confirm the specific requirements before submitting your photo.</p>',
 '  </div>',
 '</section>'
].join('\n');
const schema={
 '@context':'https://schema.org',
 '@graph':[
  {'@type':'WebSite','@id':URL+'#website','name':'IDProm','alternateName':'ID Phrom','url':URL,'inLanguage':'en','description':DESCRIPTION},
  {'@type':'WebPage','@id':URL+'#webpage','url':URL,'name':TITLE,'description':DESCRIPTION,'inLanguage':'en','isPartOf':{'@id':URL+'#website'}}
 ]
};
export function englishLandingHtml(thaiHtml){
 let html=once(thaiHtml,/<html lang="th">/,'<html lang="en">','html language');
 html=once(html,/<title>[^<]*<\/title>/,'<title>'+TITLE+'</title>','title');
 html=meta(html,'name','description',DESCRIPTION);
 html=meta(html,'name','robots','index,follow,max-image-preview:large');
 html=once(html,/<link rel="canonical" href="[^"]+">/,'<link rel="canonical" href="'+URL+'">','canonical');
 for(const [name,value] of [['og:locale','en_US'],['og:site_name','IDProm'],['og:title',TITLE],['og:description',DESCRIPTION],['og:url',URL]])html=meta(html,'property',name,value);
 for(const [name,value] of [['twitter:title',TITLE],['twitter:description',DESCRIPTION]])html=meta(html,'name',name,value);
 html=once(html,/<script type="application\/ld\+json">[\s\S]*?<\/script>/,
   '<script type="application/ld+json">\n'+JSON.stringify(schema,null,2)+'\n  </script>','structured data');
 const open='<section class="idprom-seo" aria-labelledby="idprom-seo-title">';
 const begin=html.indexOf(open);
 if(begin<0||html.indexOf(open,begin+open.length)!==-1)throw Error('English SEO visible section not found');
 const end=html.indexOf('</section>',begin);
 if(end<0)throw Error('English SEO visible section not closed');
 return html.slice(0,begin)+ENGLISH_CONTENT+html.slice(end+'</section>'.length);
}
