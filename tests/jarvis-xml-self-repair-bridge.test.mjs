import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createJarvisFsBridgeApp} from '../jarvis-fs-bridge.js';
import {prepareBoundedXmlArtifact} from '../jarvis-structured-artifact-recovery.js';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
test('host XML writer auto-recovers a narrowly malformed XML document with physical readback, but cannot overwrite it',async t=>{
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-xml-bridge-v142-'));
 t.after(()=>fs.rmSync(fixture,{recursive:true,force:true}));
 const root=path.join(fixture,'worktree'),remote=path.join(fixture,'remote.git');
 const git=process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/cmd/git.exe')?
    'C:/Program Files/Git/cmd/git.exe':'git';
 fs.mkdirSync(root);
 execFileSync(git,['init','--bare',remote],{stdio:'ignore'});
 execFileSync(git,['init','-b','v142-official'],{cwd:root,stdio:'ignore'});
 const g=args=>execFileSync(git,['-c','protocol.file.allow=always',...args],{cwd:root,stdio:'ignore'});
 g(['config','user.name','Jarvis Fixture']);
 g(['config','user.email','xml-fixture@example.invalid']);
 const canonicalRemote='https://github.com/heberzzt-wq/fixgo-app.git';
 g(['remote','add','origin',canonicalRemote]);
 g(['remote','set-url','--push','origin',pathToFileURL(remote).href]);
 g(['config','url.'+pathToFileURL(remote).href+'.insteadOf',canonicalRemote]);
 fs.writeFileSync(path.join(root,'jarvis-runtime-contract.json'),JSON.stringify({
    projectId:'fixgo-app',repository:'heberzzt-wq/fixgo-app',branch:'v142-official',releaseId:'test-release'
 }));
 fs.writeFileSync(path.join(root,'identity-marker.txt'),'test\n');
 g(['add','.']);g(['commit','-m','initial test contract']);
 g(['push','-u','origin','v142-official']);
 const server=createJarvisFsBridgeApp({root}).listen(0,'127.0.0.1');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const output='.jarvis-artifacts/documents/sample.xml';
 const content='<document><cliente>Tom & Jerry</cliente><monto>100</monto></document>';
 const send=(body)=>fetch(base+'/document',{method:'POST',headers:{'content-type':'application/json','x-jarvis-release-id':'test-release'},
  body:JSON.stringify({format:'xml',output,title:'Sample',...body})});
 const response=await send({content});
 const created=await response.json();
 assert.equal(response.status,200,JSON.stringify(created));
 assert.equal(created.status,'DOCUMENT_CREATED');
 assert.equal(created.xmlContentProof.verified,true);
 assert.equal(created.xmlContentProof.status,'XML_TEXT_ENTITY_AUTO_REPAIRED');
 assert.equal(created.xmlContentProof.recovery.attempts,2);
 assert.equal(created.xmlContentProof.recovery.escapedAmpersands,1);
 assert.equal(created.artifact.mimeType,'application/xml');
 const actual=fs.readFileSync(path.resolve(root,created.output),'utf8');
 assert.equal(actual,'<document><cliente>Tom &amp; Jerry</cliente><monto>100</monto></document>');
 assert.equal(created.xmlContentProof.finalSha256,sha(actual));
 assert.equal(created.xmlContentProof.sourceSha256,sha(content));
 const overwrite=await send({content:'<document>overwrite</document>'});
 assert.equal(overwrite.status,409);
 assert.equal((await overwrite.json()).status,'XML_ARTIFACT_OVERWRITE_FORBIDDEN');
 assert.equal(fs.readFileSync(path.resolve(root,created.output),'utf8'),actual);
 const invalid=await send({output:'.jarvis-artifacts/documents/broken.xml',content:'<root><item></root>'});
 assert.equal(invalid.status,422);
 assert.equal((await invalid.json()).status,'XML_STRUCTURE_REGENERATION_REQUIRED');
 assert.equal(fs.existsSync(path.resolve(root,'.jarvis-artifacts/documents/broken.xml')),false);
});
test('structured XML repair is deterministic and rejects unsafe declarations and attributes',()=>{
 const original='<root><text>A & B</text></root>';
 const repaired=prepareBoundedXmlArtifact(original);
 assert.equal(repaired.ok,true);
 assert.equal(repaired.recovery.onlyTextEntities,true);
 assert.equal(repaired.content,'<root><text>A &amp; B</text></root>');
 for(const candidate of [
  '<root><item></root>',
  '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>',
  '<root attr="A & B"><item/></root>'
 ]){
  const value=prepareBoundedXmlArtifact(candidate);
  assert.equal(value.ok,false,candidate);
 }
});
