const test=require('node:test'),assert=require('node:assert/strict');
const {compactRepositoryContinuation}=require('../functions/jarvis-repository-audit-codec.cjs');
const fixture=require('./fixtures/jarvis-continuation-schema-pressure.json');
function expand(schema){const defs=schema.$defs;const walk=v=>{if(!v||typeof v!=='object')return v;if(v.$ref)return walk(defs[v.$ref.slice('#/$defs/'.length)]);return Array.isArray(v)?v.map(walk):Object.fromEntries(Object.entries(v).filter(([k])=>k!=='$defs').map(([k,x])=>[k,walk(x)]));};return walk(schema);}
const args={type:'object',additionalProperties:false,required:['file'],properties:{file:{type:'string',enum:['source.js'],description:'An unchanged authorized source filename with a deliberately long description.'}}};
function request(a=args,b=args){return {config:{chatMessages:[],responseJsonSchema:{type:'object',properties:{toolCalls:{type:'array',items:{type:'object',properties:{args:a}}},sourceFallback:{type:'object',properties:{args:b}}}}}};}
test('identical continuation argument schemas share local definitions with lossless roundtrip',()=>{
 const req=request(),before=JSON.stringify(req),out=compactRepositoryContinuation(req);assert.ok(out.config.responseJsonSchema.$defs);assert.deepEqual(expand(out.config.responseJsonSchema),req.config.responseJsonSchema);assert.equal(JSON.stringify(req),before);
});
test('different, small, pre-referenced or scoped schemas retain their exact native form',()=>{
 for(const req of [request(args,{...args,required:[]}),request({type:'object'},{type:'object'}),request({...args,$ref:'#/elsewhere'}),request({...args,$defs:{x:{type:'string'}}}),request({...args,$id:'https://example.invalid/schema'})])assert.deepEqual(compactRepositoryContinuation(req).config.responseJsonSchema,req.config.responseJsonSchema);
});
test('real continuation crosses the unchanged context preflight only through reversible schema sharing',()=>{
 const before=JSON.stringify(fixture),old=JSON.stringify(fixture.config.chatMessages).length+JSON.stringify(fixture.config.responseJsonSchema).length;
 const out=compactRepositoryContinuation(fixture),next=JSON.stringify(out.config.chatMessages).length+JSON.stringify(out.config.responseJsonSchema).length;
 assert.ok(old>24576);assert.ok(next<=24576,JSON.stringify({old,next}));assert.deepEqual(expand(out.config.responseJsonSchema),fixture.config.responseJsonSchema);assert.deepEqual(out.config.chatMessages,fixture.config.chatMessages);assert.equal(JSON.stringify(fixture),before);
});
