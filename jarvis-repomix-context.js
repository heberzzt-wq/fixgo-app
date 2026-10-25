// Bounded read-only Repomix adapter. The CLI is installed OUTSIDE this repo.
// Never treat compacted code as executable authority or a verified source read.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const TOOL_ROOT=path.join(os.homedir(),'Documents','Jarvis-V142-Manifiestos','tools','repomix-isolated');
const EXECUTABLE=path.join(TOOL_ROOT,'node_modules','repomix','bin','repomix.cjs');
const isAllowedFile=file=>typeof file==='string' &&
    file.length<=220 && !file.includes('..') && !file.includes('\\') &&
    /^(?:(?:gestia-core\/(?:jarvis|repo)\/|modules\/terminal\/)[\w./-]+|jarvis-[\w.-]+)\.(?:js|mjs|cjs)$/i.test(file) &&
    !/(?:secret|credential|token|private.key|auth-config|firebase-admin|service-account|\.env)/i.test(file);

// Read-only discovery inside the same code allowlist. These are file metadata,
// not code reads, successful contexts or permission to substitute user sources.
async function contextRecoveryCandidates(root) {
    const found=[];
    const pending=["","gestia-core/jarvis","gestia-core/repo","modules/terminal"];
    let scanned=0;
    while(pending.length && scanned<600) {
        const directory=pending.shift();
        let entries;
        try {
            const target=path.resolve(root,directory),real=await fs.realpath(target);
            if(real!==target || (real!==root && !real.startsWith(root+path.sep)))continue;
            entries=await fs.readdir(real,{withFileTypes:true});
        } catch {continue;}
        for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
            if(++scanned>600)break;
            const file=directory ? directory+"/"+entry.name : entry.name;
            if(entry.isDirectory() && directory && file.split("/").length<6) {
                pending.push(file);continue;
            }
            if(!entry.isFile() || !isAllowedFile(file))continue;
            const target=path.resolve(root,file);
            try {
                const real=await fs.realpath(target);
                if(real!==target || !real.startsWith(root+path.sep))continue;
                const stat=await fs.stat(real);
                if(stat.isFile() && stat.size>0 && stat.size<=85000)
                    found.push({file,sourceBytes:stat.size});
            } catch {}
        }
    }
    return {source:"LOCAL_REPOSITORY_FILE_METADATA",operationalEvidence:false,
        candidates:found.sort((a,b)=>a.sourceBytes-b.sourceBytes || a.file.localeCompare(b.file)).slice(0,24),
        partial:scanned>=600 || found.length>24};
}

export async function packAuthorizedRepositoryContext({
    root,files,tokenBudget=1800,outputMaxBytes=14000,cli=EXECUTABLE
}={}) {
    if(typeof root!=='string'||!path.isAbsolute(root))throw Error('REPO_CONTEXT_ROOT_REQUIRED');
    if(!Array.isArray(files)||files.length<1||files.length>6||
       files.some(file=>!isAllowedFile(file))||new Set(files).size!==files.length)
        throw Error('REPO_CONTEXT_FILE_SCOPE_DENIED');
    if(!Number.isInteger(tokenBudget)||tokenBudget<256||tokenBudget>2200)
        throw Error('REPO_CONTEXT_BUDGET_INVALID');
    if(!Number.isInteger(outputMaxBytes)||outputMaxBytes<2048||outputMaxBytes>16000)
        throw Error('REPO_CONTEXT_OUTPUT_LIMIT_INVALID');
    const resolvedRoot=await fs.realpath(root);
    const filesVerified=[];
    let totalSize=0;
    for(const file of files) {
        const target=path.resolve(resolvedRoot,file);
        let real;
        try {real=await fs.realpath(target);}
        catch(error){
            if(['ENOENT','ENOTDIR'].includes(error?.code))
                throw new Error('REPO_CONTEXT_SOURCE_NOT_FOUND');
            throw error;
        }
        if(!real.startsWith(resolvedRoot+path.sep)||real!==target)
            throw Error('REPO_CONTEXT_SYMLINK_OR_TRAVERSAL_DENIED');
        const stat=await fs.stat(real);
        totalSize+=stat.size;
        if(!stat.isFile()||stat.size>85000||totalSize>240000)
            throw Object.assign(Error('REPO_CONTEXT_SOURCE_TOO_LARGE'),{details:{
                file,sourceBytes:stat.size,sourceLimitBytes:85000,
                totalBytes:totalSize,totalLimitBytes:240000,
                requiresDifferentSources:true,
                recoveryAction:'SELECT_SMALLER_OBSERVED_AUTHORIZED_SOURCES',
                sourceDiscovery:await contextRecoveryCandidates(resolvedRoot)
            }});
        filesVerified.push({file,sha256:createHash('sha256').update(await fs.readFile(real)).digest('hex')});
    }
    const actualCli=await fs.realpath(cli);
    if(!actualCli.startsWith(await fs.realpath(TOOL_ROOT)+path.sep))
        throw Error('REPO_CONTEXT_UNTRUSTED_CLI');
    const cliInfo=JSON.parse(await fs.readFile(path.join(TOOL_ROOT,'node_modules','repomix','package.json'),'utf8'));
    if(cliInfo.name!=='repomix'||cliInfo.version!=='1.18.1')throw Error('REPO_CONTEXT_VERSION_DRIFT');
    const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'jarvis-repomix-'));
    try{
        // Explicit empty JSON config in isolated dir prevents executing any
        // project/global repomix.config.js when processing private code.
        const config=path.join(tmp,'repomix.config.json');
        const output=path.join(tmp,'packed.xml');
        await fs.writeFile(config,'{}');
        await run(process.execPath,[actualCli,resolvedRoot,'--config',config,
            '--include',files.join(','),'--compress','--style','xml',
            '--token-budget',String(tokenBudget),'--no-file-summary',
            '--no-directory-structure','--no-git-sort-by-changes','--output',output,
            '--quiet'],{cwd:tmp,timeout:30000,maxBuffer:350000,windowsHide:true,
            env:{...process.env,CI:'true',NO_COLOR:'1'}});
        const data=await fs.readFile(output);
        if(data.length>outputMaxBytes)throw Error('REPO_CONTEXT_OUTPUT_TOO_LARGE');
        const text=data.toString('utf8');
        if(filesVerified.some(item=>!text.includes('file path="'+item.file+'"')))
            throw Error('REPO_CONTEXT_MISSING_SOURCE');
        return {ok:true,status:'REPO_CONTEXT_READY',tool:'repo.context',
            source:'LOCAL_REPOMIX_READ_ONLY',version:'1.18.1',
            files:filesVerified,tokenBudget,
            outputBytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),
            packedContext:text,contextIsUnverifiedPreview:true,
            independentlyCertified:false,writePerformed:false,externalModelUsed:false};
    }catch(error){
        if(error?.code === 'ENOENT' || error?.code === 'ENOTDIR')
            throw Error('REPO_CONTEXT_SOURCE_NOT_FOUND');
        if(error?.code!==undefined || error?.killed || error?.signal){
            const diagnostics=String(error?.stderr||'').slice(0,4000).toLowerCase();
            if(/token.budget|exceed.*token|token.*exceed/.test(diagnostics))
                throw Error('REPO_CONTEXT_BUDGET_EXCEEDED');
            if(/no files|no matching files|no files found/.test(diagnostics))
                throw Error('REPO_CONTEXT_NO_FILES_MATCHED');
            if(error?.killed || error?.signal==='SIGTERM')
                throw Error('REPO_CONTEXT_PROCESS_TIMEOUT');
            throw Error('REPO_CONTEXT_PROCESS_FAILED');
        }
        throw error;
    }finally{await fs.rm(tmp,{recursive:true,force:true});}
}
