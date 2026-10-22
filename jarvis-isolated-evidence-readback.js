// Authenticated, read-only inspection of host-generated V142 fixture evidence.
// No Docker execution, no arbitrary-path reads, and no source-tree mutation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseIsolatedTestReport,ISOLATED_IMAGE_SHA,CONTROLLED_FIXTURE} from './scripts/jarvis-isolated-patch-probe.mjs';

const MISSION=/^general-[a-f0-9-]{36}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const leaf=/^[a-f0-9-]{36}\.json$/i;
const hash=content=>createHash('sha256').update(content,'utf8').digest('hex');

export function assertIsolatedEvidenceRecord(value,missionId,{root=process.cwd()}={}){
 if(!MISSION.test(String(missionId||'')))throw Error('ISOLATED_EVIDENCE_MISSION_INVALID');
 if(value?.schema!=='jarvis-v142-controlled-isolation-v1'||value.missionId!==missionId||
    value.sourceFile!==CONTROLLED_FIXTURE||value.status!=='ISOLATED_BEFORE_AFTER_VERIFIED'||
    value.patchApplied!==false||value.humanApprovalStillRequired!==true||
    value.productionRepairCertified!==false||value.sourceRepoUnchanged!==true||
    value.imageId!==ISOLATED_IMAGE_SHA||!SHA.test(value.sourceSha256||'')||
    !SHA.test(value.expectedSha256||'')||!SHA.test(value.patchFingerprint||'')||
    !SHA.test(value.evidenceSha256||''))throw Error('ISOLATED_EVIDENCE_SCOPE_INVALID');
 const {evidenceSha256,...rest}=value;
 if(hash(JSON.stringify(rest))!==evidenceSha256)throw Error('ISOLATED_EVIDENCE_DIGEST_INVALID');
 const source=path.resolve(root,...CONTROLLED_FIXTURE.split('/'));
 if(!fs.existsSync(source)||fs.lstatSync(source).isSymbolicLink()||
    hash(fs.readFileSync(source,'utf8'))!==value.sourceSha256)
    throw Error('ISOLATED_EVIDENCE_SOURCE_CHANGED');
 const before=value.before,after=value.after;
 if(before?.exitCode!==1||before.tests!==4||before.passed!==3||before.failed!==1||
    before.targetFailure!==true||after?.exitCode!==0||after.tests!==4||
    after.passed!==4||after.failed!==0||after.targetPass!==true)
    throw Error('ISOLATED_EVIDENCE_STAGE_INVALID');
 if(typeof before.stdout!=='string'||typeof after.stdout!=='string'||
    before.stdout.length>10000||after.stdout.length>10000)
    throw Error('ISOLATED_EVIDENCE_OUTPUT_INVALID');
 const b=parseIsolatedTestReport(before.stdout),a=parseIsolatedTestReport(after.stdout);
 if(!b.targetFailure||b.targetPass||!b.counts.tests4||!b.counts.pass3||!b.counts.fail1||
    !a.targetPass||a.targetFailure||!a.counts.tests4||!a.counts.pass4||!a.counts.fail0)
    throw Error('ISOLATED_EVIDENCE_TAP_MISMATCH');
 return {ok:true,status:'ISOLATED_FIXTURE_BEFORE_AFTER_VERIFIED',
    missionId,sourceFile:value.sourceFile,sourceSha256:value.sourceSha256,
    expectedSha256:value.expectedSha256,imageId:value.imageId,
    fingerprint:value.patchFingerprint,evidenceSha256,
    before:{tests:4,passed:3,failed:1,exitCode:1},
    after:{tests:4,passed:4,failed:0,exitCode:0},
    sourceRepoUnchanged:true,patchApplied:false,productionRepairCertified:false,
    humanApprovalStillRequired:true,scope:'controlled-fixture-only',
    evidenceKind:'locally-archived-docker-output-not-remote-attestation'};
}

export function inspectArchivedIsolatedEvidence({missionId,root=process.cwd()}={}){
 if(!MISSION.test(String(missionId||'')))throw Error('ISOLATED_EVIDENCE_MISSION_INVALID');
 const folder=path.resolve(root,'.jarvis-artifacts','isolated-repair',missionId);
 if(!fs.existsSync(folder))return {ok:false,status:'ISOLATED_EVIDENCE_NOT_ARCHIVED',missionId};
 if(fs.lstatSync(folder).isSymbolicLink()||!fs.statSync(folder).isDirectory())
    throw Error('ISOLATED_EVIDENCE_FOLDER_UNSAFE');
 const files=fs.readdirSync(folder,{withFileTypes:true})
    .filter(x=>x.isFile()&&leaf.test(x.name)).map(x=>x.name).sort().slice(0,50);
 for(const name of files){
  const file=path.join(folder,name);
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||stat.size>25000||stat.size<150)continue;
  try{
   const data=JSON.parse(fs.readFileSync(file,'utf8'));
   const validated=assertIsolatedEvidenceRecord(data,missionId,{root});
   return {...validated,archiveName:name};
  }catch{/* a forged or corrupt archive must not be certified */}
 }
 return {ok:false,status:'ISOLATED_EVIDENCE_UNVERIFIED',missionId};
}

export function createIsolatedEvidenceReadHandler({root=process.cwd(),authorize}={}){
 if(typeof authorize!=='function')throw Error('ISOLATED_EVIDENCE_AUTH_REQUIRED');
 return async (req,res)=>{
  if(!await authorize(req,res))return;
  const missionId=req.body?.missionId;
  if(!MISSION.test(String(missionId||''))||Object.keys(req.body||{}).some(k=>k!=='missionId'))
    return res.status(400).json({ok:false,status:'ISOLATED_EVIDENCE_REQUEST_INVALID'});
  try{
   return res.set('Cache-Control','no-store').json(inspectArchivedIsolatedEvidence({root,missionId}));
  }catch{
   return res.status(400).json({ok:false,status:'ISOLATED_EVIDENCE_READ_BLOCKED'});
  }
 };
}
