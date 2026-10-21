// Local HTTP preview of registered experimental HTML only; never source files.
export function createQwenArtifactPreview({enabled=false,identity,readArtifact,findArtifact}={}){
    return (req,res)=>{
        const current=identity?.();
        if(!enabled||current?.ok!==true||current.contract?.branch!=='codex/v142-qwen-auth-pilot'||
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
