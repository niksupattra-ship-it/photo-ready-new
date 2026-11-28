import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import sharp from 'sharp';
import {registerFemaleLabTransport} from '../female-full-lab-transport.js';
test('lab post-processing receives the exact selected garment from the submitted job',async t=>{
 const png=await sharp({create:{width:16,height:16,channels:4,background:'#765432'}}).png().toBuffer();let calls=0;
 const app=express();registerFemaleLabTransport(app,{route:'/test-body-lab',payloadFor:async()=>({prompt:'inert',image:[],model:'inert'}),fetchImpl:async()=>Response.json({data:[{b64_json:png.toString('base64')}]}),processResult:async(input,context)=>{calls++;assert.deepEqual(input,png);assert.deepEqual(context.files.outfit[0].buffer,png);assert.equal(context.payload.prompt,'inert');return input}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port,id=randomUUID(),form=new FormData();for(const [key,value]of Object.entries({key:'inert-test',requestId:id,prompt:'inert',order:'person-outfit-hair'}))form.set(key,value);for(const name of ['person','hair','outfit'])form.set(name,new Blob([png],{type:'image/png'}),name+'.png');
 assert.equal((await fetch(base+'/test-body-lab',{method:'POST',body:form})).status,202);
 let result;for(let i=0;i<30;i++){result=await fetch(base+'/test-body-lab/'+id);if(result.status!==202)break;await new Promise(r=>setTimeout(r,10))}
 assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);assert.equal(calls,1);
});
