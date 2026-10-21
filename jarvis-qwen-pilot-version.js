import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {generalPilotSourceSignature} from './modules/terminal/qwen-general-pilot.js';

export const WATCHED=Object.freeze([
 'jarvis-fs-bridge.js',
 'jarvis-qwen-decision-http.js',
 'jarvis-qwen-direct-cycle.js',
 'jarvis-qwen-general-policy.js',
 'jarvis-qwen-local-action.js',
 'jarvis-qwen-tool-bridge.js',
 'jarvis-qwen-advertising-review.js',
 'jarvis-material-library.js',
 'jarvis-artifact-studio.js',
 'jarvis-docx-artifact.js',
 'jarvis-xlsx-calculation.js',
 'jarvis-pdf-content-proof.js',
 'jarvis-speech-timeline.js',
 'jarvis-qwen-local-asr.js',
 'jarvis-qwen-visual-review.js',
 'gestia-core/jarvis/jarvis.image.adapter.js',
 'gestia-core/jarvis/jarvis.multitool.pack.js',
 'jarvis-qwen-pilot-version.js',
 'modules/terminal/nexo-bootstrap.js',
 'modules/terminal/qwen-direct-pilot.js',
 'modules/terminal/qwen-direct-transport.js',
 'modules/terminal/qwen-general-pilot.js',
 'modules/terminal/qwen-general-evidence.js',
 'modules/terminal/qwen-general-resume.js',
 'modules/terminal/qwen-empty-catalog.js',
 'modules/terminal/qwen-general-contract.js',
 'modules/terminal/qwen-general-media.js',
 'modules/terminal/qwen-production-document.js',
 'modules/terminal/qwen-poster-proof.js'
]);
const digest=s=>createHash('sha256').update(s).digest('hex');
export const expectedPilotFingerprint=()=>digest(generalPilotSourceSignature());
export function createPilotVersionGate(root){
 const folder=resolve(root);
 const bootedAt=Date.now();
 const diskSignature=()=>digest(WATCHED.map(file=>{
    const bytes=readFileSync(join(folder,file));
    return file+':'+createHash('sha256').update(bytes).digest('hex');
 }).join('\n'));
 let runningFingerprint,initError=null;
 try{runningFingerprint=diskSignature();}catch(error){initError='QWEN_PILOT_SOURCE_UNREADABLE';}
 const clientFingerprint=expectedPilotFingerprint();
 function inspect(candidate={},requireClient=true){
    let currentFingerprint;
    try{currentFingerprint=diskSignature();}catch{return {ok:false,reason:'QWEN_PILOT_SOURCE_UNREADABLE'};}
    if(initError||currentFingerprint!==runningFingerprint)
        return {ok:false,reason:'QWEN_PILOT_BRIDGE_RESTART_REQUIRED'};
    if(requireClient&&(candidate.clientFingerprint!==clientFingerprint||
        !Number.isFinite(candidate.clientStartedAt)||
        candidate.clientStartedAt<bootedAt))
        return {ok:false,reason:'QWEN_PILOT_BROWSER_RELOAD_REQUIRED'};
    return {ok:true,reason:'QWEN_PILOT_SOURCE_MATCH',bootedAt,sourceFingerprint:runningFingerprint,clientFingerprint};
 }
 return {inspect,bootedAt};
}
