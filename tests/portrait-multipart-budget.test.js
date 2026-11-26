import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {PORTRAIT_UPLOAD_LIMITS} from '../portrait-upload-limits.js';
import {describePortraitFailure} from '../src/portrait-process-failure.js';
const source=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
const start=source.indexOf('for(let canonicalAttempt=0;canonicalAttempt<2;canonicalAttempt++)');
const builder=source.slice(start,source.indexOf('const acceptTrial=',start));
const keys=[...new Set([...builder.matchAll(/fd\.append\('([^']+)'/g)].map(m=>m[1]))].filter(k=>!['image','originalSource'].includes(k));
const form=(names=keys,files=1)=>{const f=new FormData();for(const k of names)f.append(k,'fixture');for(let i=0;i<files;i++)f.append(i?'originalSource':'image',new Blob(['small-image'],{type:'image/png'}),'fixture.png');return f};
test('actual current multipart metadata reproduces old 413 with tiny files, and the shared new parser accepts it',async()=>{
 assert(keys.length>20,'Client has outgrown the old metadata field count');
 const app=express();let accepted=0;
 for(const [route,limits] of [['old',{...PORTRAIT_UPLOAD_LIMITS,fields:20,parts:24}],['new',PORTRAIT_UPLOAD_LIMITS]])app.post('/'+route,multer({storage:multer.memoryStorage(),limits}).any(),(req,res)=>{accepted++;res.json({fields:Object.keys(req.body).length,files:req.files.length})});
 app.use((error,req,res,next)=>res.status(413).json({code:error.code}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  const old=await fetch(base+'/old',{method:'POST',body:form()});assert.equal(old.status,413);assert.equal((await old.json()).code,'LIMIT_FIELD_COUNT');assert.equal(accepted,0);
  for(const files of [1,2]){const result=await fetch(base+'/new',{method:'POST',body:form(keys,files)});assert.equal(result.status,200);assert.deepEqual(await result.json(),{fields:keys.length,files})}
  const excessive=await fetch(base+'/new',{method:'POST',body:form(Array.from({length:49},(_,i)=>'extra'+i))});assert.equal(excessive.status,413);assert.equal(accepted,2);
  const tooManyFiles=await fetch(base+'/new',{method:'POST',body:form([],3)});assert.equal(tooManyFiles.status,413);assert.equal(accepted,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
 assert.equal(PORTRAIT_UPLOAD_LIMITS.fileSize,20*1024*1024);assert.equal(PORTRAIT_UPLOAD_LIMITS.files,2);
 const serverSource=await readFile(new URL('../server.js',import.meta.url),'utf8');assert(serverSource.includes('limits:PORTRAIT_UPLOAD_LIMITS'));
});
test('413 and generic Thai failures show the requested copy while retaining internal diagnostics and useful English detail',async()=>{
 for(const error of [{status:413,stage:'submit_job',message:'Too many fields'},{code:'UNKNOWN',message:'private server response'}]){
  const th=describePortraitFailure(error,false);assert.equal(th.title,error.status===413?'ส่งข้อมูลไม่สำเร็จ':'ประมวลผลไม่สำเร็จ');assert.match(th.message,error.status===413?/HTTP 413/:/UNKNOWN/);assert(!th.message.includes('private'));
 }
 const en=describePortraitFailure({status:413,stage:'submit_job'},true);assert.equal(en.status,413);assert.equal(en.stage,'submit_job');assert.match(en.message,/upload limit/);
 const editor=await readFile(new URL('../src/studio-editor.jsx',import.meta.url),'utf8');assert(editor.includes("{englishFlow&&typeof portraitProcessError==='object'&&(portraitProcessError.stage||portraitProcessError.status)&&"));
});
