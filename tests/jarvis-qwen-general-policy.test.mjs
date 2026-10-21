import test from 'node:test';import assert from 'node:assert/strict';
import {createGeneralToolPolicy,localGeneralPilot} from '../jarvis-qwen-general-policy.js';
const location={protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'};
test('general pilot excludes public hosting, other ports and the strict B2C route',()=>{
 assert.equal(localGeneralPilot(location),true);
 for(const changed of [{hostname:'fixgo-44e4d.web.app'},{port:'443'},{search:'?qwenPilot=b2c-census-v1'},{protocol:'https:'}])assert.equal(localGeneralPilot({...location,...changed}),false);
});
test('general artifact policy confines outputs and rejects model authority and existing outputs',()=>{
 const p=createGeneralToolPolicy({location,missionId:'general-12345678'}),output=p.artifactRoot+'page.html';
 assert.equal(p.authorize({name:'page.create',args:{output}}).ok,true);
 for(const args of [{output:'../page.html'},{output:p.artifactRoot+'../page.html'},{output,approved:true}])assert.equal(p.authorize({name:'page.create',args}).ok,false);
 assert.equal(p.authorize({name:'page.create',args:{output}},[{ok:true,observation:{output}}]).ok,false);
 for(const name of ['repo.write','repo.gitPush','platform.write','video.generate'])assert.equal(p.accept({name,mutates:true}),false);
});
test('browser approval is bound to the created artifact receipt and cannot open production',()=>{
 const p=createGeneralToolPolicy({location,missionId:'general-12345678'}),output=p.artifactRoot+'page.html';
 const call={name:'browser.open',args:{url:p.preview(output)}};
 assert.equal(p.authorize(call).ok,false);
 assert.deepEqual(p.authorize(call,[{ok:true,name:'page.create',observation:{output}}]),{ok:true,approved:true});
 assert.equal(p.authorize({name:'browser.open',args:{url:'https://example.com'}}).ok,false);
});
