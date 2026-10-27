import test from 'node:test';
import assert from 'node:assert/strict';
import {registerJarvisActuatorTools} from '../gestia-core/jarvis/jarvis.actuator.pack.js';
import {registerJarvisMultifunctionTools} from '../gestia-core/jarvis/jarvis.multitool.pack.js';
import {__test as planner} from '../gestia-core/jarvis/jarvis.multifunction.planner.js';

const tools=[];
const registry={register:tool=>{tools.push(tool);return {ok:true};}};
registerJarvisActuatorTools(registry);
registerJarvisMultifunctionTools(registry);

for(const scenario of [
 {label:'two PDF destinations',name:'document.create',args:[
  {format:'pdf',output:'manual.pdf',title:'Manual',content:'Manual solicitado'},
  {format:'pdf',output:'cotizacion.pdf',title:'Cotizacion',content:'Cotizacion solicitada'}]},
 {label:'two documents named by title with generated output paths',name:'document.create',args:[
  {format:'docx',title:'Manual',content:'Manual solicitado'},
  {format:'docx',title:'Cotizacion',content:'Cotizacion solicitada'}]},
 {label:'independent prose compositions of the same format',name:'document.compose',args:[
  {format:'pdf',title:'Manual',instructions:'Redacta el manual'},
  {format:'pdf',title:'Cotizacion',instructions:'Redacta la cotizacion'}]},
 {label:'independent workbook compositions',name:'spreadsheet.compose',args:[
  {title:'Gastos',instructions:'Compone el libro de gastos'},
  {title:'Inventario',instructions:'Compone el libro de inventario'}]}
]) test(`document mission preserves ${scenario.label} and suppresses exact duplicate calls`,()=>{
 const tool=tools.find(item=>item.name===scenario.name);
 assert.ok(tool,'Use the actual registered tool metadata');
 const calls=scenario.args.map(args=>({name:scenario.name,args}));
 const result=planner.trustedPlanCalls({toolCalls:[calls[0],structuredClone(calls[0]),calls[1]]},[tool],{
  originalInstruction:'Crea dos entregables separados con su contenido propio.'
 });
 assert.equal(result.length,2);
 assert.deepEqual(result.map(({name,args})=>({name,args})),calls);
 assert.ok(result.every(call=>call.approved===false),'Deduplication never grants approval');
});
