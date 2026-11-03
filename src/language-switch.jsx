import React from 'react';
import {englishPreviewEnabled,languageLink} from './english-preview.js';
import './language-switch.css';
export function LanguageSwitch(){
 const english=englishPreviewEnabled();
 return <nav className="language-switch" aria-label="Language" data-no-translate="true">
  {english&&<span className="language-switch-preview">English preview</span>}
  <a href={languageLink(globalThis.location,!english)} hrefLang={english?'th':'en'} lang={english?'th':'en'}>{english?'ภาษาไทย':'English'}</a>
 </nav>;
}
