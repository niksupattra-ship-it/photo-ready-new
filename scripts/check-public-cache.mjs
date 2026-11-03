import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {publicAssetHeaders} from '../public-assets-cache.js';
const dir=await mkdtemp(path.join(tmpdir(),'photo-public-cache-'));let server;
try{
 await mkdir(path.join(dir,'assets'),{recursive:true});
 for(const [name,body]of Object.entries({'index.html':'<h1>Home</h1>','assets/index-AbCd1234.js':'export const version=1;','assets/portrait-example.png':'unversioned-image','assets/photo-guide.abcdef123456.webp':'versioned-image'}))await writeFile(path.join(dir,name),body);
 const app=express();app.get('/api/wallet',(_req,res)=>res.set('Cache-Control','no-store').json({balance:0}));app.use(express.static(dir,{setHeaders:publicAssetHeaders}));app.use((_req,res)=>res.set('Cache-Control','no-cache').sendFile(path.join(dir,'index.html')));
 server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 for(const name of ['/assets/index-AbCd1234.js','/assets/photo-guide.abcdef123456.webp']){const response=await fetch(base+name);assert.equal(response.status,200);assert(response.headers.get('cache-control').includes('immutable'));assert(response.headers.get('cache-control').includes('max-age=31536000'))}
 const plain=await fetch(base+'/assets/portrait-example.png');assert(!plain.headers.get('cache-control').includes('immutable'));assert(plain.headers.get('cache-control').includes('max-age=0'));
 for(const route of ['/','/studio']){const response=await fetch(base+route);assert.equal(response.headers.get('cache-control'),'no-cache')}
 const html=await fetch(base+'/');const status=await new Promise((resolve,reject)=>http.get(base+'/',{headers:{'If-None-Match':html.headers.get('etag')}},response=>{response.resume();resolve(response.statusCode)}).on('error',reject));assert.equal(status,304);
 const wallet=await fetch(base+'/api/wallet');assert.equal(wallet.headers.get('cache-control'),'no-store');assert.deepEqual(await wallet.json(),{balance:0});
 console.log('PASS immutable caching only for versioned public files; mutable images revalidate, HTML revalidates with ETag, private API responses remain no-store. Local fixtures only.');
}finally{if(server)await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}
