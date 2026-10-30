import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mobileRelayNeedsFreshOwnerToken} from '../modules/terminal/jarvis-mobile-relay-policy.js';
import {createSelfHostedSemanticEngine} from '../jarvis-fs-bridge.js';
const ui=fs.readFileSync('gestia-terminal.html','utf8');
const attachment=fs.readFileSync('modules/terminal/jarvis-attachments.js','utf8');
const relay=fs.readFileSync('modules/terminal/nexo-bootstrap.js','utf8');
const server=fs.readFileSync('jarvis-fs-bridge.js','utf8');
test('upload vision over existing semantic route obtains fresh owner ID token',()=>{
 const visual={semanticStage:'OWNER_UPLOADED_MEDIA_REVIEW'};
 assert.equal(mobileRelayNeedsFreshOwnerToken('/semantic/respond',visual),true);
 assert.equal(mobileRelayNeedsFreshOwnerToken('/semantic/respond',{semanticStage:'FINAL_RESPONSE'}),false);
 assert.match(relay,/path === "\/semantic\/respond" && payload\?\.semanticStage === "OWNER_UPLOADED_MEDIA_REVIEW"/);
 assert.match(server,/authorizeOwnerVisualSemantic/);
 assert.match(server,/createWorkstationAuthorization\(\{/);
 assert.match(server,/req\.body\?\.semanticStage === "OWNER_UPLOADED_MEDIA_REVIEW"/);
});
test('explicit media upload intent selects native media.analyze and Qwen instead of oversized planner',()=>{
 assert.match(attachment,/function prepareVisualReview\(question = ""\)/);
 assert.match(attachment,/prepareVisualReview,/);
 assert.match(attachment,/state\.items\.length > 4/);
 assert.match(attachment,/item\.saved\?\.sha256/);
 assert.match(ui,/window\.JarvisAttachments\?\.prepareVisualReview\?\.\(rawCommand\)/);
 assert.match(ui,/name: "media\.analyze"/);
 assert.match(ui,/localUploadedMediaReview:/);
 assert.match(ui,/semanticStage: "OWNER_UPLOADED_MEDIA_REVIEW"/);
 assert.match(ui,/window\.renderJarvisResponse\?\.\(/);
 assert.doesNotMatch(ui.slice(ui.indexOf('const visualReview = window.JarvisAttachments'),ui.indexOf('// Auditoría vinculada a la traza actual')),/model:\s*['"](?:gpt|gemini|claude)/);
});
test('the visual semantic stage rejects unsupported envelopes before any local model execution',async()=>{
 const engine=createSelfHostedSemanticEngine({root:process.cwd()});
 for(const payload of [
  null,{attachments:[]},{attachments:Array(5).fill({output:'x',sha256:'a'.repeat(64)})}
 ]){
  await assert.rejects(()=>engine.respond({
   input:'Qué ves',semanticStage:'OWNER_UPLOADED_MEDIA_REVIEW',
   localMediaReview:payload
  }),/LOCAL_MEDIA_REVIEW_REQUEST_INVALID/);
 }
});
test('mobile transport does not create a new relay route or expose unauthenticated media payload',()=>{
 const source=fs.readFileSync('gestia-core/jarvis/jarvis.semantic.transport.js','utf8');
 assert.doesNotMatch(source,/\/artifact\/vision\/analyze/);
 assert.doesNotMatch(source,/\/upload\/visual\/analyze/);
 assert.match(source,/"\/semantic\/respond"/);
 assert.match(server,/authorizeOwnerVisualSemantic/);
 assert.match(server,/verifyIdToken:\s*verifyBrowserIdToken/);
});
