import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOpenAIUprightPose,OPENAI_UPRIGHT_POSE_INSTRUCTION} from '../openai-upright-pose.js';
import {openaiPhotographicInstruction} from '../openai-portrait-transport.js';
import {faceProportions,compareThaiFaceShape} from '../src/face-proportion-check.js';
import {MAKEUP_STUDIO_RETOUCH_POLICY} from '../makeup-studio-retouch-policy.js';
test('only full-body portrait generation normalizes source-neck and pose locks; cosmetic/head-only edits retain exact prompt',()=>{
 const input='Identity unchanged. '+MAKEUP_STUDIO_RETOUCH_POLICY+' Skin and garment unchanged.';
 assert.equal(normalizeOpenAIUprightPose(input,false),input);
 const normalized=normalizeOpenAIUprightPose(input,true);
 assert(!normalized.includes('neck width/length and head scale.'));
 assert(!normalized.includes('Keep pose, outfit, collar'));
 assert(normalized.startsWith('Identity unchanged.'));assert(normalized.endsWith(' Skin and garment unchanged.'));
 assert.equal(normalizeOpenAIUprightPose(normalized,true),normalized);
 assert(openaiPhotographicInstruction({thaiRealFaceVersion:'body'}).endsWith(OPENAI_UPRIGHT_POSE_INSTRUCTION));
 assert(!openaiPhotographicInstruction({makeupStudioReference:Buffer.from('guide')}).includes(OPENAI_UPRIGHT_POSE_INSTRUCTION));
 assert(!openaiPhotographicInstruction({}).includes(OPENAI_UPRIGHT_POSE_INSTRUCTION));
});
test('existing face-shape guard accepts coherent head-roll straightening but still rejects changed facial shape',()=>{
 const points={33:[.35,.35],263:[.65,.35],152:[.5,.8],234:[.2,.45],454:[.8,.45],172:[.27,.66],397:[.73,.66],1:[.5,.51],13:[.5,.65]};
 const landmarks=angle=>{const out=[];for(const [id,[x,y]] of Object.entries(points)){const a=x-.5,b=y-.5;out[id]={x:.5+a*Math.cos(angle)-b*Math.sin(angle),y:.5+a*Math.sin(angle)+b*Math.cos(angle)}}return out};
 const straight=faceProportions(landmarks(0),1000,1000),tilted=faceProportions(landmarks(.23),1000,1000);
 assert.equal(compareThaiFaceShape(tilted,straight).ok,true);
 assert.equal(compareThaiFaceShape(tilted,{...straight,jawWidth:straight.jawWidth*.75}).ok,false);
});
