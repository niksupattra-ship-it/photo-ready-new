// Server-side English entry page for /en/.
// Uses the same built React app as Thai; does not alter Thai HTML or payment APIs.
import {ENGLISH_LANDING_URL,ENGLISH_SEO_TITLE as TITLE,ENGLISH_SEO_DESCRIPTION as DESCRIPTION} from './english-seo-meta.js';
export {ENGLISH_LANDING_URL} from './english-seo-meta.js';
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
 '        <span class="idprom-howto-eyebrow">AI professional headshots · Resume and CV photos</span>',
 '        <h2 id="idprom-seo-title">Create Professional ID and Job Application Photos Online</h2>',
 '        <p>Turn a clear photo into a professional headshot for your resume, CV, job application or professional profile. Choose a business outfit, hairstyle and background, then review the AI portrait before deciding whether to purchase a download.</p>',
 '      </div>',
 '    </header>',
 '    <div class="idprom-steps" aria-label="How to create your professional photo">',
 '      <div class="idprom-step"><span class="idprom-step-num">01</span><strong>Upload your photo</strong><span>Use a well-lit, front-facing image with your face clearly visible.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">02</span><strong>Choose your style</strong><span>Select an outfit and background, then create your portrait with AI.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">03</span><strong>Review your portrait</strong><span>Check the preview and refine your image in Studio before purchasing.</span></div>',
 '      <div class="idprom-step"><span class="idprom-step-num">04</span><strong>Download your photo</strong><span>Choose a photo size and save PNG or PDF after unlocking.</span></div>',
 '    </div>',
 '    <h3>Professional headshots from your own photo</h3>',
 '    <p>IDProm is a browser-based AI portrait editor. Start with a front-facing photo in even light, select a suit or shirt, and refine the result in Studio. Keep your portrait recognizable and check the face, hair, clothing and edges before using it for an application.</p>',
 '    <h3>Resume, CV and job application photos</h3>',
 '    <p>Use a photo when the employer or application asks for one. A simple background and a clear head-and-shoulders crop keep attention on your face. Whether a resume should include a photo depends on the application and destination; follow the employer’s instructions.</p>',
 '    <h3>Photo sizes and printable downloads</h3>',
 '    <p>The English editor includes original size, 35 × 45 mm, 2 × 2 inches, 33 × 48 mm and 50 × 70 mm. After unlocking your image, choose a PNG download or a printable PDF. A matching size alone does not make an AI-edited photo acceptable for an official document.</p>',
 '    <nav class="idprom-guide-links" aria-label="English photo guides"><a href="/en/job-application-photos/">Resume and job application photo guide</a><a href="/en/photo-sizes/">Photo sizes in millimetres, inches and pixels</a></nav>',
 '    <h3>Questions before you start</h3>',
 '    <details><summary>Can I preview a portrait before paying?</summary><p>You can review the available preview before purchasing a download. Watermark-free downloads require an eligible purchase or an existing entitlement.</p></details>',
 '    <details><summary>Do I need to install an app?</summary><p>No installation is needed. Use IDProm in a current desktop or mobile browser, upload your photo and use the English editor.</p></details>',
 '    <details><summary>Can I use an AI portrait for a passport or visa?</summary><p>Do not assume an AI-edited portrait is suitable. Official applications may prohibit generated or digitally altered photographs. Check the issuing authority’s current rules and use an unedited photo when required.</p></details>',
 '    <p class="idprom-seo-note">Photo requirements vary by employer, institution and country. Confirm the specific requirements before submitting your photo.</p>',
 '  </div>',
 '</section>'
].join('\n');
const schema={
 '@context':'https://schema.org',
 '@graph':[
  {'@type':'WebSite','@id':URL+'#website','name':'IDProm','alternateName':'ID Phrom','url':URL,'inLanguage':'en','description':DESCRIPTION},
  {'@type':'WebPage','@id':URL+'#webpage','url':URL,'name':TITLE,'description':DESCRIPTION,'inLanguage':'en','isPartOf':{'@id':URL+'#website'},'mainEntity':{'@id':URL+'#app'}},
  {'@type':'WebApplication','@id':URL+'#app','name':'IDProm','url':URL,'applicationCategory':'MultimediaApplication','operatingSystem':'Any','browserRequirements':'Requires JavaScript and a current web browser','inLanguage':'en','description':DESCRIPTION,'featureList':['AI professional portraits','Outfit and background selection','Photo crop and size presets','PNG and printable PDF downloads after unlocking']}
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

// Register before static files: /public/en/ contains guides, so serving static
// first would change the application's /en redirect from 308 to a directory 301.
export function registerEnglishLanding(app,{loadIndex}){
 app.get(/^\/en\/?$/,async(req,res,next)=>{
  try{
   if(req.path==='/en'){
    const query=req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'';
    return res.redirect(308,'/en/'+query);
   }
   return res.set({'Cache-Control':'no-cache','Content-Language':'en'}).type('html').send(englishLandingHtml(await loadIndex()));
  }catch(error){next(error)}
 });
}
