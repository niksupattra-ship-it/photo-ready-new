import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const virtualId='virtual:idprom-studio-editor-url',resolvedId='\0'+virtualId;
// Emit the normal editor as an ES module and expose its hashed build URL. A
// retry can then use a fresh URL after a browser caches a failed module fetch.
export default defineConfig(({command})=>({
 build:{cssCodeSplit:false},
 plugins:[{
  name:'idprom-studio-editor-url',
  resolveId(id){if(id===virtualId)return resolvedId},
  load(id){
   if(id!==resolvedId)return;
   if(command==='serve')return 'export default "/src/studio-editor.jsx";';
   const reference=this.emitFile({type:'chunk',id:fileURLToPath(new URL('./src/studio-editor.jsx',import.meta.url)),name:'studio-editor',preserveSignature:'strict'});
   return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
  }
 }]
}));
