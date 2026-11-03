import editorUrl from 'virtual:idprom-studio-editor-url';
import {createStudioEditorLoader} from './studio-editor-loader.js';
export const loadStudioEditor=createStudioEditorLoader(attempt=>{
 const url=new URL(editorUrl,globalThis.location.href);
 if(attempt)url.searchParams.set('idprom-retry',String(attempt));
 return import(/* @vite-ignore */ url.href);
});
