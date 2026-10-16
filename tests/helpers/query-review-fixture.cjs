// Positive fake-model decisions must obey the current per-objective contract.
// Tests of relevance rejection construct their own verdicts instead of using
// this helper. It supplies no operational values or completion evidence.
module.exports=function queryReviewFixture(request,verdict={matchesRequest:true}){
 const packet=module.exports.packet(request);
 const indexes=Object.keys(request.config.responseJsonSchema.properties.objectiveMatches?.properties||{});
 if(verdict.matchesRequest!==true||!indexes.length)return{text:JSON.stringify(verdict)};
 const fields=packet.proposed.fields||[];
 if(packet.proposed.mode==='query'&&!fields.length)throw Error('Positive query fixture requires its explicit projection');
 return{text:JSON.stringify({...verdict,
  // This positive fake explicitly models a useful classification requirement.
  // Count-only/irrelevant purposes are tested with separate negative verdicts.
  ...(request.config.responseJsonSchema.properties.populationFieldPurposes?{
   populationFieldPurposes:Object.fromEntries(Object.keys(request.config.responseJsonSchema.properties.populationFieldPurposes.properties).map(index=>[index,index===indexes[0]?'membership':'none']))}:{}),
  objectiveMatches:Object.fromEntries(indexes.map((index,i)=>[index,i===0])),
  ...(packet.proposed.mode==='query'?{objectiveFields:Object.fromEntries(indexes.map((index,i)=>[index,i===0?[fields[0]]:[]]))}:{})})};
};

// Candidate metadata is deliberately outside the model messages. Positive fake
// providers may inspect their modeled candidate without exposing it to Qwen.
module.exports.packet=function(request){
 const packet=JSON.parse(request.config.chatMessages.at(-1).content);
 if(packet.proposed&&Array.isArray(request.config.semanticCandidateFields))packet.proposed={...packet.proposed,fields:[...request.config.semanticCandidateFields]};
 return packet;
};
