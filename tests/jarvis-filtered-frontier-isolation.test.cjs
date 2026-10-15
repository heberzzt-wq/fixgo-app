const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=process.env.JARVIS_TEST_REPO||path.resolve(__dirname,'..');
const {eligibleEvidenceActionCatalog,hasRequiredToolArguments}=require(path.join(root,'functions/jarvis-semantic-planner.js'));
const filters=[{field:'organizationId',op:'==',value:'alpha'}],otherFilters=[{field:'organizationId',op:'==',value:'beta'}];
function fixture({mode='query',orderBy=[],fields=['amount'],sourceFile='billing.js'}={}){
 const args={sourceFile,collection:'organizations/alpha/invoices',mode,fields,filters,orderBy};
 const record={source:'FIRESTORE_SERVER_AUTHENTICATED',readOnly:true,scope:{...args,implicitExistenceFields:[]},rows:[{id:'invoice-a',values:{amount:12}}],totalCount:1,returnedCount:1,hasMore:false,queryExhausted:true,completeForQuery:true,consistentCountAndList:true};
 const task={name:'platform.query',args,observation:{ok:true,executionOk:true,recordEvidence:record}};
 const tool={name:'platform.query',evidenceKinds:['platform_records'],investigationReadOnly:true,mutates:false,inputSchema:{type:'object',properties:{
  sourceFile:{type:'string',enum:['billing.js','billing-summary.js']},collection:{type:'string',enum:['organizations/alpha/invoices','organizations/beta/invoices']},
  mode:{type:'string',enum:[mode]},fields:{type:'array',items:{type:'string',enum:['amount','issuedAt']},minItems:1},
  filters:{type:'array',minItems:1,enum:[filters,otherFilters]},orderBy:{type:'array',enum:[[],[{field:'issuedAt',direction:'asc'}],[{field:'issuedAt',direction:'desc'}]]}
 },required:['sourceFile','collection','mode','fields','filters','orderBy']}};
 return{args,task,tool};
}
for(const mode of['query','count'])test('finite '+mode+' recovery preserves mandatory organization scopes',()=>{
 const {args,task,tool}=fixture({mode});const catalog=eligibleEvidenceActionCatalog([tool],[task]);
 const allows=args=>catalog.some(t=>hasRequiredToolArguments(t,args));
 assert.equal(allows(args),false,'the exact completed projection/count is removed');
 assert.equal(allows({...args,filters:[]}),false,'required organization scope is never removed');
 assert.equal(allows({...args,filters:otherFilters}),true,'different exact filters remain independent');
 assert.equal(allows({...args,collection:'organizations/beta/invoices'}),true,'another route is not completed by the alpha receipt');
 assert.equal(allows({...args,sourceFile:'billing-summary.js'}),true,'another source is not silently conflated');
 if(mode==='query')assert.equal(allows({...args,fields:['issuedAt','amount']}),true,'a new observed field remains queryable alongside an existing field');
});
test('finite ordering remains separate from completed filtered evidence',()=>{
 const ascending=[{field:'issuedAt',direction:'asc'}],descending=[{field:'issuedAt',direction:'desc'}];
 const {args,task,tool}=fixture({orderBy:ascending});const catalog=eligibleEvidenceActionCatalog([tool],[task]);
 const allows=args=>catalog.some(t=>hasRequiredToolArguments(t,args));
 assert.equal(allows(args),false);
 assert.equal(allows({...args,orderBy:descending}),true);
 assert.equal(allows({...args,orderBy:[]}),true);
});
test('a filtered zero does not complete other permitted organizations or filters',()=>{
 const {args,task,tool}=fixture();
 Object.assign(task.observation.recordEvidence,{rows:[],totalCount:0,returnedCount:0});
 const catalog=eligibleEvidenceActionCatalog([tool],[task]),allows=args=>catalog.some(t=>hasRequiredToolArguments(t,args));
 assert.equal(allows(args),false);
 assert.equal(allows({...args,filters:otherFilters}),true);
 assert.equal(allows({...args,collection:'organizations/beta/invoices'}),true);
});
