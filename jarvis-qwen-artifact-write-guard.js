import fs from 'node:fs';import path from 'node:path';
// Preserve existing engine contracts, but never overwrite experimental creations.
export function qwenArtifactWriteGuard(root){
 return (req,res,next)=>{
  const fields={'/image':['output'],'/speech/synthesize':['output'],'/reel/create':['output','studioOutput','videoOutput']}[req.path];
  if(req.method!=='POST'||!fields)return next();
  for(const field of fields){const output=req.body?.[field];
   if(typeof output!=='string'||!/^\.jarvis-artifacts\/(?:qwen-general\/general-|images\/general-|audio\/general-)/.test(output))continue;
   const base=path.resolve(root),target=path.resolve(base,output);
   if(!target.startsWith(base+path.sep)||output.split(/[\\/]/).includes('..'))return res.status(400).json({ok:false,error:'EXPERIMENTAL_ARTIFACT_PATH_REQUIRED'});
   for(let current=target;current!==base;current=path.dirname(current)){
    if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())return res.status(403).json({ok:false,error:'EXPERIMENTAL_ARTIFACT_LINK_FORBIDDEN'});
   }
   if(fs.existsSync(target))return res.status(409).json({ok:false,error:'EXISTING_ARTIFACT_OVERWRITE_FORBIDDEN'});
  }
  return next();
 };
}
