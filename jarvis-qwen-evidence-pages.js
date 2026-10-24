// Mechanical, lossless pagination of source evidence for the single local Qwen.
// This does not grant authorization or certify mission success.
import {createHash} from 'node:crypto';

const sha=value=>createHash('sha256').update(value).digest('hex');
const utf8=value=>Buffer.byteLength(value,'utf8');
const MAX_RECORDS=1000, MAX_BYTES=8*1024*1024;

function pieces(text,maxPageBytes) {
    const result=[];
    const total=utf8(text),pageCount=Math.max(1,Math.ceil(total/maxPageBytes));
    // Balance the last page; avoid one huge page plus a tiny orphan fragment.
    const targetBytes=Math.min(maxPageBytes,Math.max(1,Math.ceil(total/pageCount)));
    let page='',size=0;
    for(const char of text) {
        const n=utf8(char);
        if(size+n>targetBytes && page) {result.push(page);page='';size=0;}
        page+=char;size+=n;
    }
    if(page || !result.length)result.push(page);
    return result;
}
export function createVerifiedEvidencePages({missionId,instruction,records,maxPageBytes=2400}={}) {
    if(typeof missionId!=='string'||!missionId.trim()||missionId.length>128)throw Error('EVIDENCE_MISSION_ID_REQUIRED');
    if(typeof instruction!=='string'||!instruction.trim())throw Error('EVIDENCE_INSTRUCTION_REQUIRED');
    if(!Number.isInteger(maxPageBytes)||maxPageBytes<256||maxPageBytes>8192)throw Error('EVIDENCE_PAGE_SIZE_INVALID');
    if(!Array.isArray(records)||!records.length||records.length>MAX_RECORDS)throw Error('EVIDENCE_RECORDS_INVALID');
    if(utf8(instruction)>MAX_BYTES)throw Error('EVIDENCE_INSTRUCTION_TOO_LARGE');
    let totalBytes=0;
    const sources=[],pages=[];
    for(const [sourceIndex,record] of records.entries()) {
        if(typeof record?.sourceId!=='string'||!record.sourceId.trim()||record.sourceId.length>512 ||
           typeof record.text!=='string')throw Error('EVIDENCE_SOURCE_INVALID');
        if(sources.some(x=>x.sourceId===record.sourceId))throw Error('EVIDENCE_DUPLICATE_SOURCE');
        totalBytes+=utf8(record.text);
        if(totalBytes>MAX_BYTES)throw Error('EVIDENCE_TOTAL_TOO_LARGE');
        const fragments=pieces(record.text,maxPageBytes);
        const source={sourceIndex,sourceId:record.sourceId,bytes:utf8(record.text),sha256:sha(record.text),pageCount:fragments.length};
        sources.push(source);
        let startByte=0;
        for(const [pageIndex,text] of fragments.entries()) {
            const bytes=utf8(text);
            pages.push({id:sha(JSON.stringify([missionId,record.sourceId,pageIndex,sha(text)])),
                sourceId:record.sourceId,sourceIndex,pageIndex,startByte,bytes,sha256:sha(text),text});
            startByte+=bytes;
        }
    }
    return {missionId,instruction,instructionSha256:sha(instruction),
        totalBytes,sourceCount:sources.length,pageCount:pages.length,sources,pages};
}
export function verifyEvidencePages(bundle) {
    if(!bundle||!Array.isArray(bundle.sources)||!Array.isArray(bundle.pages) ||
       typeof bundle.instruction!=='string'||sha(bundle.instruction)!==bundle.instructionSha256)
        throw Error('EVIDENCE_BUNDLE_CORRUPTED');
    let totalBytes=0,expectedPages=0;
    const rebuilt=[];
    for(const source of bundle.sources) {
        const pages=bundle.pages.filter(p=>p.sourceId===source.sourceId);
        if(pages.length!==source.pageCount||pages.some((p,i)=>p.pageIndex!==i ||
            p.sourceIndex!==source.sourceIndex))throw Error('EVIDENCE_PAGES_MISSING_OR_REORDERED');
        let offset=0,joined='';
        for(const p of pages) {
            if(p.startByte!==offset||utf8(p.text)!==p.bytes||sha(p.text)!==p.sha256||
                p.id!==sha(JSON.stringify([bundle.missionId,p.sourceId,p.pageIndex,p.sha256])))
                throw Error('EVIDENCE_PAGE_CORRUPTED');
            offset+=p.bytes;joined+=p.text;
        }
        if(offset!==source.bytes||sha(joined)!==source.sha256)throw Error('EVIDENCE_SOURCE_CORRUPTED');
        totalBytes+=offset;expectedPages+=pages.length;
        rebuilt.push({sourceId:source.sourceId,text:joined});
    }
    if(expectedPages!==bundle.pages.length||bundle.sources.length!==bundle.sourceCount||
       totalBytes!==bundle.totalBytes||expectedPages!==bundle.pageCount)
        throw Error('EVIDENCE_BUNDLE_COVERAGE_MISMATCH');
    return {ok:true,missionId:bundle.missionId,sourceCount:bundle.sourceCount,
        pageCount:bundle.pageCount,totalBytes,records:rebuilt};
}
// The callback is a single-model review, never an independent source of truth.
// A missing or mismatched page MUST remain PARTIAL; no artificial finish.
export async function reviewVerifiedEvidencePages({bundle,reviewPage,signal,onProgress=()=>{},onCheckpoint=async()=>{},initialReceipts=[]}={}) {
    const verified=verifyEvidencePages(bundle);
    if(typeof reviewPage!=='function')throw Error('EVIDENCE_REVIEWER_REQUIRED');
    if(!Array.isArray(initialReceipts)||initialReceipts.length>bundle.pageCount)
        throw Error('EVIDENCE_RESUME_RECEIPTS_INVALID');
    for(const [index,r] of initialReceipts.entries()) {
        const p=bundle.pages[index];
        if(r?.pageId!==p.id||r?.sha256!==p.sha256||r?.sourceId!==p.sourceId||
           r?.kind!=='UNVERIFIED_MODEL_NOTES'||typeof r?.notes!=='string')
            throw Error('EVIDENCE_RESUME_RECEIPTS_UNVERIFIED');
    }
    const receipts=structuredClone(initialReceipts);
    for(const page of bundle.pages.slice(receipts.length)) {
        if(signal?.aborted)return {status:'CANCELLED',coverage:'PARTIAL',receipts,
            reviewedPages:receipts.length,totalPages:bundle.pageCount};
        try {
            const result=await reviewPage({instruction:bundle.instruction,sourceId:page.sourceId,
                pageId:page.id,pageIndex:page.pageIndex,pageCount:bundle.sources[page.sourceIndex].pageCount,
                text:page.text,sha256:page.sha256,signal});
            if(result?.pageId!==page.id||result?.sha256!==page.sha256||typeof result?.notes!=='string')
                throw Error('EVIDENCE_REVIEW_RECEIPT_MISMATCH');
            receipts.push({pageId:page.id,sourceId:page.sourceId,sha256:page.sha256,
                notes:result.notes,kind:'UNVERIFIED_MODEL_NOTES'});
            await onCheckpoint({missionId:bundle.missionId,instructionSha256:bundle.instructionSha256,
                receipts:structuredClone(receipts),totalPages:bundle.pageCount});
            onProgress({reviewedPages:receipts.length,totalPages:bundle.pageCount});
        }catch(error) {
            return {status:'PARTIAL',coverage:'PARTIAL',reason:String(error?.message||error),
                receipts,reviewedPages:receipts.length,totalPages:bundle.pageCount,
                instructionSha256:bundle.instructionSha256};
        }
    }
    return {status:'REVIEWED_NOT_CERTIFIED',coverage:'ALL_PAGES_REVIEWED',
        receipts,reviewedPages:receipts.length,totalPages:verified.pageCount,
        instructionSha256:bundle.instructionSha256,independentlyCertified:false};
}
