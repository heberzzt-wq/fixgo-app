// Validate every model-selected argument against the EXACT offered host schema.
// No generated schema/LLM response is ever a grant of authorization.
const equivalent=(a,b)=>JSON.stringify(sort(a))===JSON.stringify(sort(b));
function sort(v){
 return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
}
function isType(value,type){
 switch(type){
  case 'object':return value!==null&&typeof value==='object'&&!Array.isArray(value);
  case 'array':return Array.isArray(value);
  case 'integer':return typeof value==='number'&&Number.isInteger(value);
  case 'number':return typeof value==='number'&&Number.isFinite(value);
  case 'null':return value===null;
  default:return typeof value===type;
 }
}
export function validateOfferedArguments(schema,value){
 let visited=0;
 function check(rule,v,key='',depth=0){
  if(++visited>20000||depth>32)return 'ARGUMENT_SCHEMA_LIMIT_EXCEEDED';
  if(!rule||typeof rule!=='object')return null;
  if(rule.const!==undefined&&!equivalent(rule.const,v))return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
  if(Array.isArray(rule.enum)&&!rule.enum.some(x=>equivalent(x,v)))return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
  if(rule.type&&!([].concat(rule.type)).some(t=>isType(v,t)))return 'ARGUMENT_TYPE_INVALID:'+key;
  if(typeof v==='string'){
   if(Number.isInteger(rule.minLength)&&[...v].length<rule.minLength)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   if(Number.isInteger(rule.maxLength)&&[...v].length>rule.maxLength)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   if(rule.pattern){
    let pass=false;try{pass=new RegExp(rule.pattern,'u').test(v);}catch{return 'ARGUMENT_SCHEMA_INVALID:'+key;}
    if(!pass)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   }
  }
  if(typeof v==='number'){
   if(Number.isFinite(rule.minimum)&&v<rule.minimum)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   if(Number.isFinite(rule.maximum)&&v>rule.maximum)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
  }
  if(Array.isArray(v)){
   if(Number.isInteger(rule.minItems)&&v.length<rule.minItems)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   if(Number.isInteger(rule.maxItems)&&v.length>rule.maxItems)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   if(rule.uniqueItems&&new Set(v.map(x=>JSON.stringify(sort(x)))).size!==v.length)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
   for(let i=0;i<v.length;i++){
    const item=Array.isArray(rule.items)?rule.items[i]:rule.items;
    if(item){const bad=check(item,v[i],key?key+'.'+i:String(i),depth+1);if(bad)return bad;}
   }
  }
  if(v!==null&&typeof v==='object'&&!Array.isArray(v)){
   for(const property of rule.required||[])if(!Object.hasOwn(v,property))
    return 'REQUIRED_ARGUMENT_MISSING:'+(key?key+'.':'')+property;
   for(const [property,child] of Object.entries(v)){
    const next=key?key+'.'+property:property;
    const prop=rule.properties?.[property];
    if(!prop&&rule.additionalProperties===false)return 'ARGUMENT_UNDECLARED:'+next;
    if(prop){const bad=check(prop,child,next,depth+1);if(bad)return bad;}
    if(!prop&&rule.additionalProperties&&typeof rule.additionalProperties==='object'){
     const bad=check(rule.additionalProperties,child,next,depth+1);if(bad)return bad;
    }
   }
  }
  if(Array.isArray(rule.allOf))for(const sub of rule.allOf){const bad=check(sub,v,key,depth+1);if(bad)return bad;}
  if(Array.isArray(rule.anyOf)&&rule.anyOf.length){
   let firstError=null,valid=false;
   for(const sub of rule.anyOf){
    const bad=check(sub,v,key,depth+1);
    if(!bad){valid=true;break;}
    firstError??=bad;
   }
   if(!valid)return firstError||'ARGUMENT_OUTSIDE_SCHEMA:'+key;
  }
  if(Array.isArray(rule.oneOf)&&rule.oneOf.length){
   let count=0;
   for(const sub of rule.oneOf)if(!check(sub,v,key,depth+1))count++;
   if(count!==1)return 'ARGUMENT_OUTSIDE_SCHEMA:'+key;
  }
  return null;
 }
 if(!isType(value,'object'))return 'TOOL_ARGUMENTS_REQUIRED';
 return check(schema||{type:'object'},value);
}
