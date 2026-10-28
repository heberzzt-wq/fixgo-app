import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isJarvisLocalWorkstationBrowser} from '../modules/terminal/nexo-bootstrap.js';

const html=readFileSync('gestia-terminal.html','utf8');
const source=readFileSync('modules/terminal/nexo-bootstrap.js','utf8');

test('desktop localhost can offer owner broker while Android localhost via USB cannot',()=>{
 const desktop='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156 Safari/537.36';
 const android='Mozilla/5.0 (Linux; Android 15; LGN-LX3) AppleWebKit/537.36 Chrome/156 Mobile Safari/537.36';
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'127.0.0.1',userAgent:desktop}),true);
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'localhost',userAgent:desktop}),true);
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'127.0.0.1',userAgent:android}),false);
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'localhost',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18)'}),false);
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'fixgo-44e4d.web.app',userAgent:desktop}),false);
 assert.equal(isJarvisLocalWorkstationBrowser({hostname:'127.0.0.1',userAgent:''}),false);
});

test('broker activation and retries are restricted to desktop and keep owner/SHA gate',()=>{
 assert.match(source,/bridge\.enablePrivateRelay = async \(\) => \{\s*if \(typeof window !== 'undefined' && !isJarvisLocalWorkstationBrowser\(\)\)/);
 assert.match(source,/JARVIS_RELAY_WORKSTATION_BROWSER_REQUIRED/);
 assert.match(source,/privateRelayWorkstationEnabled\(\) && \(typeof window === 'undefined' \|\| isJarvisLocalWorkstationBrowser\(\)\)/);
 assert.match(source,/contract\.privateRelayEnabled !== true/);
 assert.match(source,/startJarvisBrowserRelay/);
 assert.match(source,/JARVIS_RELAY_LOCAL_RELEASE_MISMATCH/);
});

test('workstation link control is shown only on local desktop, not public web or Android',()=>{
 assert.match(html,/id="btn-relay-workstation" hidden/);
 assert.match(html,/id="terminal-relay-workstation-control"/);
 assert.match(html,/!\['127\.0\.0\.1','localhost'\]\.includes\(host\) \|\| isMobile/);
 assert.match(html,/bridge\.enablePrivateRelay\(\)/);
 assert.match(html,/aria-label/);
});

test('desktop link handler parses and hidden button cannot leak into mobile layout',async()=>{
 const {parse}=await import('acorn');
 const body=html.split('<script id="terminal-relay-workstation-control">')[1]?.split('</script>')[0];
 assert.ok(body);
 assert.doesNotThrow(()=>parse(body,{ecmaVersion:'latest',sourceType:'script'}));
 assert.match(html,/#btn-relay-workstation\[hidden\] \{ display: none !important; \}/);
});
