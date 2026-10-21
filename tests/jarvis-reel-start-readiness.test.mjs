import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {reelExportStartExpression} from '../jarvis-fs-bridge.js';
test('large reel HTML cannot report started before its export handler is installed',()=>{
 let clicked=0;const button={onclick:null,click(){clicked++}};const window={};const scope={window,document:{querySelector:()=>button}};
 assert.equal(vm.runInNewContext(reelExportStartExpression(),scope),'REEL_EXPORT_HANDLER_NOT_READY');assert.equal(clicked,0);assert.equal(window.__JARVIS_HEADLESS_EXPORT__,undefined);
 button.onclick=()=>{};assert.equal(vm.runInNewContext(reelExportStartExpression(),scope),'REEL_EXPORT_STARTED');assert.equal(clicked,1);assert.equal(window.__JARVIS_HEADLESS_EXPORT__,true);
});
