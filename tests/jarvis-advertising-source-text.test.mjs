import test from 'node:test';import assert from 'node:assert/strict';
import {advertisingSourceText} from '../modules/terminal/qwen-general-evidence.js';
test('advertising evidence keeps article content instead of navigation in bounded semantic context',()=>{
 const quote='Financial advertising must avoid misleading claims and explain the offered services accurately.';
 const html='<title>Responsible financial marketing</title><nav>'+('Menu account login '.repeat(900))+'</nav><main><h1>Responsible financial marketing</h1><p>'+quote+'</p><script>invented advantage</script></main><footer>Purchase now</footer>';
 const text=advertisingSourceText(html);assert.ok(text.includes(quote));assert.ok(text.length<300);assert.ok(!text.includes('Menu'));assert.ok(!text.includes('invented advantage'));assert.ok(!text.includes('Purchase now'));
});
