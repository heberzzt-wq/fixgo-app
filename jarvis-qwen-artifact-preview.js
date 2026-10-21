// Loopback-only preview of registered Qwen HTML (official V142 or isolated pilot); never repository source files.
export function createQwenArtifactPreview({enabled=false,identity,readArtifact,findArtifact}={}){
    return (req,res)=>{
        const current=identity?.();
        const official=current?.contract?.branch==='v142-official'&&
            current?.git?.branch==='v142-official'&&current?.git?.clean===true&&
            typeof current?.git?.head==='string'&&current.git.head===current.contractHead;
        const isolated=current?.contract?.branch==='codex/v142-qwen-auth-pilot';
        if(!enabled||current?.ok!==true||!(official||isolated)||
            !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress))return res.status(403).send('QWEN_PREVIEW_FORBIDDEN');
        const output=req.query?.output;
        if(typeof output!=='string'||!/^\.jarvis-artifacts\/qwen-general\/general-[a-zA-Z0-9-]{8,80}\/[a-zA-Z0-9._-]+\.html$/.test(output))
            return res.status(400).send('QWEN_PREVIEW_SCOPE_INVALID');
        try{
            if(!findArtifact(output))return res.status(404).send('QWEN_REGISTERED_ARTIFACT_REQUIRED');
            const payload=readArtifact(output);
            if(payload.mimeType!=='text/html')return res.status(415).send('QWEN_HTML_REQUIRED');
            res.set({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
                'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"});
            return res.send(Buffer.from(payload.dataBase64,'base64'));
        }catch{return res.status(404).send('QWEN_ARTIFACT_UNAVAILABLE');}
    };
}
