const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('bounded rejection context retains a distinct veto instead of duplicating its stronger population receipt',()=>{
 const source=fs.readFileSync('functions/jarvis-semantic-planner.js','utf8');
 const start=source.indexOf('        const currentQueryRejections=()=>{'),end=source.indexOf('                const canonicalArgs',start);
 assert.ok(start>0&&end>start);
 const key=(call,population=false)=>(population?'query-population-rejection:':'query-rejection:')+JSON.stringify({sourceFile:call.args.sourceFile,collection:call.args.collection,mode:call.args.mode,...(!population?{fields:call.args.fields}:{})});
 const common={sourceFile:'observed/module-with-a-long-but-valid-source-reference-for-the-current-repository.js',filters:[]};
 const query={name:'records.read',args:{...common,collection:'organizations/{organizationId}/entries',mode:'query',fields:Array.from({length:6},(_,i)=>'observed_nested_attribute_'+i)}};
 const other={name:'records.read',args:{...common,collection:'organizations/{organizationId}/archive',mode:'count'}};
 const receipt=proposed=>({code:'SEMANTIC_QUERY_SCOPE_UNVERIFIED',proposed,limitation:'The observed scope does not contribute the requested evidence. '.repeat(3),schemaDiscoveryRelevant:false,populationRelevance:'irrelevant',rejectionKind:'semantic',operationalEvidence:false,objectiveSatisfied:false});
 const decisionCache=new Map([[key(other),{queryRejection:receipt(other)}],[key(query),{queryRejection:receipt(query)}],[key(query,true),{queryRejection:receipt(query)}]]);
 const result=vm.runInNewContext('(()=>{'+source.slice(start,end)+';return currentQueryRejections()})()',{decisionCache,queryDecisionKey:key});
 assert.equal(result.filter(item=>item.proposed.args.collection===query.args.collection).length,1,'retain only the stronger witnessed population veto for the same query');
 assert.ok(result.some(item=>item.proposed.args.collection===other.args.collection),'the independent older veto must remain visible before inference');
 assert.ok(JSON.stringify(result).length<=2000);
});
