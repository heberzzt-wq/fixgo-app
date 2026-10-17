import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';

const source=readFileSync(new URL('../functions/jarvis-semantic-planner.js',import.meta.url),'utf8');
const declarations=parse(source,{ecmaVersion:'latest'}).body.filter(n=>n.type==='FunctionDeclaration');
const compact=runInNewContext('('+source.slice(declarations.find(n=>n.id.name==='compactActionCatalog').start,declarations.find(n=>n.id.name==='compactActionCatalog').end)+')',{
 buildNativeInputSchema:schema=>schema
});
for(const projection of ['items','enumerated'])test('nested correlated constraints preserve '+projection+' projections without lending fields across sources',()=>{
 const operators=['==','!=','<','<=','>','>=','in','not-in','array-contains','array-contains-any'];
 const branches=Array.from({length:projection==='items'?30:24},(_,i)=>{
  const fields=[...(projection==='enumerated'?['shared_observed_attribute_'+'segment'.repeat(18)]:[]),...Array.from({length:18},(_,j)=>`attribute_${i}_${j}_observed_in_this_source`)];
  return {required:['sourceFile','collection','mode','fields','filters'],properties:{
   sourceFile:{enum:[`module-${i}.js`]},collection:{enum:[`organizations/approved/records-${i}`]},mode:{enum:['query']},
   fields:projection==='items'?{type:'array',maxItems:20,items:{enum:fields}}:{type:'array',enum:fields.slice(0,1).map(field=>[field])},
   filters:{type:'array',maxItems:10,items:{properties:{field:{enum:fields},op:{enum:operators}}}},
   orderBy:{type:'array',maxItems:3,items:{properties:{field:{enum:fields},direction:{enum:['asc','desc']}}}}
  }};
 });
 const catalog=[{name:'platform.query',description:'Read authenticated data',requiresEvidence:[{kind:'repository_source'}],inputSchema:{anyOf:branches},mutates:false,requiresApproval:false}];
 const before=JSON.stringify(catalog),action=JSON.parse(JSON.stringify(compact(catalog)))[0];
 const resolve=(value,seen=new Set())=>{
  if(!value||typeof value!=='object')return value;
  if(value.$ref){const id=value.$ref.split('/').at(-1);assert.ok(!seen.has(id),'references must be acyclic');assert.ok(Object.hasOwn(action.$defs,id));return resolve(action.$defs[id],new Set([...seen,id]));}
  return Array.isArray(value)?value.map(x=>resolve(x,seen)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,seen)]));
 };
 for(const [i,binding]of action.evidenceBindings.entries()){
  assert.deepEqual(binding.sourceFile,[`module-${i}.js`]);
  assert.deepEqual(binding.collection,[`organizations/approved/records-${i}`]);
  const decoded=resolve(binding),fields=branches[i].properties.filters.items.properties.field.enum;
  if(projection==='items')assert.deepEqual(decoded.fields.items,fields);
  else assert.deepEqual(decoded.fields,fields.slice(0,1).map(field=>[field]));
  assert.deepEqual(decoded.filters.items.properties.field,fields);
  assert.deepEqual(decoded.orderBy.items.properties.field,fields);
  assert.deepEqual(decoded.filters.items.properties.op,operators);
 }
 assert.equal(JSON.stringify(catalog),before,'native grammar is immutable');
 const retainedEvidenceCharacters=22000;
 assert.ok(JSON.stringify(action).length+retainedEvidenceCharacters<=60000,'complete correlated catalog must leave room for existing receipts and pending goals inside the unchanged bridge budget: '+JSON.stringify(action).length);
});
