// Optional host-owned durable progress for lossless, read-only evidence pagination.
// Persisted model notes are NEVER certified source facts or authorization.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {verifyEvidencePages} from './jarvis-qwen-evidence-pages.js';

const sha=value=>createHash('sha256').update(value).digest('hex');
const fingerprint=bundle=>sha(JSON.stringify({
    missionId:bundle.missionId,instructionSha256:bundle.instructionSha256,
    sources:bundle.sources,pages:bundle.pages.map(p=>[p.id,p.sourceId,p.sha256,p.startByte,p.bytes])
}));
function validateReceipts(bundle,receipts) {
    if(!Array.isArray(receipts)||receipts.length>bundle.pages.length)throw Error('EVIDENCE_CHECKPOINT_RECEIPTS_INVALID');
    for(const [index,receipt] of receipts.entries()) {
        const page=bundle.pages[index];
        if(receipt?.pageId!==page.id||receipt?.sha256!==page.sha256||receipt?.sourceId!==page.sourceId||
            receipt?.kind!=='UNVERIFIED_MODEL_NOTES'||typeof receipt?.notes!=='string'||
            Buffer.byteLength(receipt.notes,'utf8')>8192)throw Error('EVIDENCE_CHECKPOINT_RECEIPT_MISMATCH');
    }
}
export function createEvidenceCheckpointStore({directory,bundle}={}) {
    verifyEvidencePages(bundle);
    if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('EVIDENCE_CHECKPOINT_DIRECTORY_REQUIRED');
    const digest=fingerprint(bundle);
    const filename='evidence-'+sha(bundle.missionId).slice(0,20)+'-'+digest.slice(0,20)+'.json';
    const file=path.join(directory,filename);
    async function load() {
        let text;
        try {
            const stat=await fs.lstat(file);
            if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)throw Error('EVIDENCE_CHECKPOINT_FILE_INVALID');
            text=await fs.readFile(file,'utf8');
        }catch(error){
            if(error?.code==='ENOENT')return [];
            throw error;
        }
        let data;
        try{data=JSON.parse(text);}catch{throw Error('EVIDENCE_CHECKPOINT_CORRUPT_JSON');}
        if(data?.version!==1||data.missionId!==bundle.missionId||
            data.instructionSha256!==bundle.instructionSha256||data.bundleDigest!==digest||
            !Array.isArray(data.receipts)||sha(JSON.stringify(data.receipts))!==data.receiptsSha256)throw Error('EVIDENCE_CHECKPOINT_IDENTITY_MISMATCH');
        validateReceipts(bundle,data.receipts);
        return structuredClone(data.receipts);
    }
    async function save(snapshot) {
        if(snapshot?.missionId!==bundle.missionId||snapshot?.instructionSha256!==bundle.instructionSha256||
            snapshot.totalPages!==bundle.pages.length)throw Error('EVIDENCE_CHECKPOINT_SCOPE_MISMATCH');
        const receipts=structuredClone(snapshot.receipts);
        validateReceipts(bundle,receipts);
        const previous=await load();
        if(previous.length>receipts.length||
            previous.some((item,i)=>JSON.stringify(item)!==JSON.stringify(receipts[i])))
            throw Error('EVIDENCE_CHECKPOINT_ROLLBACK_OR_FORK');
        await fs.mkdir(directory,{recursive:true});
        const parent=await fs.lstat(directory);
        if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('EVIDENCE_CHECKPOINT_DIRECTORY_UNSAFE');
        const encoded=JSON.stringify({version:1,missionId:bundle.missionId,
            instructionSha256:bundle.instructionSha256,bundleDigest:digest,
            receipts,receiptsSha256:sha(JSON.stringify(receipts))})+'\n';
        if(Buffer.byteLength(encoded,'utf8')>16*1024*1024)throw Error('EVIDENCE_CHECKPOINT_TOO_LARGE');
        const temp=file+'.'+randomUUID()+'.tmp';
        try{
            const handle=await fs.open(temp,'wx',0o600);
            try{await handle.writeFile(encoded,'utf8');await handle.sync();}
            finally{await handle.close();}
            await fs.rename(temp,file);
        }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
        return {file,receiptCount:receipts.length,coverage:'MODEL_NOTES_ONLY'};
    }
    return {file,load,save,bundleDigest:digest};
}
