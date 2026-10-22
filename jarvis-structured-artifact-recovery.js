import {XMLValidator} from 'fast-xml-parser';
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(String(value),'utf8').digest('hex');
const ENTITY=/&(?!(?:amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-f]+));)/iu;
const dangerous=/(?:<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<\?[^x])/iu;
const byteLimit=100_000;
// Only recover an unescaped ampersand in ordinary *element text*; never infer
// XML structure, insert closing tags, edit attributes, modify DOCTYPE or execute
// entity expansion. A physical post-repair parser decides completion.
export function prepareBoundedXmlArtifact(content){
 if(typeof content!=='string'||!content.trim()||Buffer.byteLength(content)>byteLimit)
  return {ok:false,status:'XML_CONTENT_OUT_OF_SCOPE',sourceSha256:null};
 const sourceSha256=sha(content);
 if(dangerous.test(content))return {ok:false,status:'XML_UNSAFE_DECLARATION',sourceSha256};
 const initial=XMLValidator.validate(content);
 if(initial===true&&!ENTITY.test(content))return {ok:true,content,verified:true,status:'XML_VERIFIED',
   sourceSha256,finalSha256:sourceSha256,recovery:{attempts:1,modified:false}};
 let changes=0;
 const repaired=content.replace(/(^|>)([^<>]+)(?=<|$)/gu,(whole,boundary,text)=>{
  const revised=text.replace(new RegExp(ENTITY.source,'giu'),()=>{changes++;return '&amp;';});
  return boundary+revised;
 });
 if(!changes||repaired===content)return {ok:false,status:'XML_STRUCTURE_REGENERATION_REQUIRED',
   sourceSha256,diagnostic:{code:String(initial?.err?.code||'XML_INVALID').slice(0,50),
    line:Number(initial?.err?.line||0),column:Number(initial?.err?.col||0)}};
 const verified=XMLValidator.validate(repaired);
 if(verified!==true||ENTITY.test(repaired))return {ok:false,status:'XML_STRUCTURE_REGENERATION_REQUIRED',sourceSha256,
   diagnostic:{code:String(verified?.err?.code||'XML_INVALID').slice(0,50),
    line:Number(verified?.err?.line||0),column:Number(verified?.err?.col||0)}};
 return {ok:true,content:repaired,verified:true,status:'XML_TEXT_ENTITY_AUTO_REPAIRED',
   sourceSha256,finalSha256:sha(repaired),
   recovery:{attempts:2,modified:true,escapedAmpersands:changes,onlyTextEntities:true,
    physicalValidation:'fast-xml-parser:XMLValidator',sourceUntouched:true}};
}

export function verifyStructuredArtifactOutcome({format='',source='',result}={}){
 if(format!=='xml'||result?.ok!==true||result?.verified!==true||
   result.sourceSha256!==sha(source)||result.finalSha256!==sha(result.content))
  return false;
 return !ENTITY.test(result.content)&&XMLValidator.validate(result.content)===true;
}
