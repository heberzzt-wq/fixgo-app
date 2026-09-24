"use strict";
const crypto=require("node:crypto");
const platform=require("./b2c-platform-contract");
const biometric=require("./b2c-biometric-identity");
const {isAuthorizedAdmin}=require("./b2c-technician-approval");
const B2C_PROVIDER_CREW_VERSION="b2c-provider-crew-v1";
function clean(value,max=200){return String(value??"").replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,max);}

function err(functions,code,message,details){return new functions.https.HttpsError(code,message,details);}

function subjectKey(providerId,memberId){return "crew_"+crypto.createHash("sha256").update(`${providerId}:${memberId}`).digest("hex").slice(0,48);}

function memberPublic(snapshot,includeEvidence=false){
  const raw=snapshot.data()||{};
  const member=platform.normalizeB2cCrewMember({...raw,member_id:snapshot.id});
  return {...member,
    evidence_complete:Boolean(raw.evidence?.profile_photo?.storage_path&&raw.evidence?.ine_front?.storage_path&&raw.evidence?.ine_back?.storage_path),
    identity_machine_status:clean(raw.identity?.machine_status,80)||"pending_capture",
    identity_duplicate_suspected:raw.identity?.duplicate_suspected===true,
    ...(includeEvidence?{evidence:raw.evidence||{},identity:raw.identity||{}}:{})
  };
}

function assertProvider(functions,raw){
  const eligibility=platform.technicianEligibility(raw,{requireAvailable:false});
  if(!eligibility.ok||raw.tipo_cuenta!=="B2C"||platform.normalizeToken(raw.rol)!=="tecnico") throw err(functions,"failed-precondition","El responsable B2C debe estar aprobado y activo.");
  const p=platform.normalizeB2cProviderProfile(raw);
  if(!p.crew_enabled) throw err(functions,"failed-precondition","La modalidad del proveedor no permite plantilla.");
  return {profile:eligibility.profile,provider:p};
}

async function verifyEvidence(bucket,providerId,memberId,kind,path,expectedGeneration=null){
  const safe=clean(path,600), prefix=`expedientes/${clean(providerId,160)}/crew/${clean(memberId,100)}/${clean(kind,40)}/`;
  if(!["profile_photo","ine_front","ine_back"].includes(kind)||!safe.startsWith(prefix)||!/^capture-[A-Za-z0-9_-]{8,180}\.(jpg|jpeg|png|webp)$/i.test(safe.slice(prefix.length))) throw new Error("CREW_EVIDENCE_PATH_INVALID");
  let metadata; try{[metadata]=await bucket.file(safe).getMetadata();}catch{throw new Error("CREW_EVIDENCE_UNAVAILABLE");}
  if(!metadata?.generation||!["image/jpeg","image/png","image/webp"].includes(metadata.contentType)||!(Number(metadata.size)>0&&Number(metadata.size)<=10*1024*1024)||(expectedGeneration&&String(metadata.generation)!==String(expectedGeneration))) throw new Error("CREW_EVIDENCE_INVALID");
  const token=String(metadata.metadata?.firebaseStorageDownloadTokens||"").split(",")[0];
  if(!token) throw new Error("CREW_EVIDENCE_TOKEN_MISSING");
  return {storage_path:safe,generation:String(metadata.generation),content_type:metadata.contentType,size:Number(metadata.size),md5_hash:metadata.md5Hash||null,url:`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(safe)}?alt=media&token=${encodeURIComponent(token)}`};
}

async function downloadBuffers(bucket,evidence){
  const map={ine_front:evidence.ine_front,selfie_front:evidence.profile_photo,ine_back:evidence.ine_back}, out={};
  for(const [kind,item] of Object.entries(map)){const [buf]=await bucket.file(item.storage_path).download();if(!Buffer.isBuffer(buf)||buf.length<1024)throw new Error(`CREW_EVIDENCE_DOWNLOAD_INVALID:${kind}`);out[kind]=buf;}
  return out;
}

function createManageB2cProviderCrewHandler({admin,db,functions,bucket}){
  const now=()=>admin.firestore.FieldValue.serverTimestamp();
  return async(data,context)=>{
    const providerId=context?.auth?.uid;if(!providerId)throw err(functions,"unauthenticated","Inicia sesión como responsable B2C.");
    const providerRef=db.collection("users").doc(providerId), snap=await providerRef.get();if(!snap.exists)throw err(functions,"not-found","Proveedor no encontrado.");
    const {provider}=assertProvider(functions,snap.data()||{});const action=clean(data?.action,40);
    if(action==="list"){const q=await providerRef.collection("crew_members").limit(100).get();return{ok:true,provider,members:q.docs.map(x=>memberPublic(x)).filter(x=>x.status!==platform.B2C_CREW_MEMBER_STATES.INACTIVE).sort((a,b)=>a.full_name.localeCompare(b.full_name,"es-MX"))};}
    const memberId=clean(data?.memberId,100);if(!/^[A-Za-z0-9_-]{8,100}$/.test(memberId))throw err(functions,"invalid-argument","memberId inválido.");
    const memberRef=providerRef.collection("crew_members").doc(memberId);
    if(action==="submit_member"){
      const fullName=clean(data?.fullName,160),role=platform.normalizeB2cCrewMember({role:data?.role}).role,phone=clean(data?.phone,40).replace(/\D/g,"").slice(0,15);
      if(fullName.length<3||phone.length<7)throw err(functions,"invalid-argument","Nombre y teléfono son obligatorios.");
      const raw=data?.evidence&&typeof data.evidence==="object"?data.evidence:{}, entries={};
      for(const kind of ["profile_photo","ine_front","ine_back"]) entries[kind]=await verifyEvidence(bucket,providerId,memberId,kind,raw[kind]?.path||raw[kind]);
      return db.runTransaction(async tx=>{
        const rosterQ=providerRef.collection("crew_members").limit(100);
        const [ps,ms,roster]=await Promise.all([tx.get(providerRef),tx.get(memberRef),tx.get(rosterQ)]);
        if(!ps.exists)throw err(functions,"not-found","Proveedor no encontrado.");assertProvider(functions,ps.data()||{});
        const activeRosterCount=roster.docs.filter(d=>d.data()?.status!==platform.B2C_CREW_MEMBER_STATES.INACTIVE).length;if(!ms.exists&&activeRosterCount>=platform.B2C_PROVIDER_MAX_MEMBERS-1)throw err(functions,"resource-exhausted","Máximo 20 personas incluyendo al responsable.");
        if(roster.docs.some(d=>d.id!==memberId&&d.data()?.status!==platform.B2C_CREW_MEMBER_STATES.INACTIVE&&clean(d.data()?.phone_digits,30)===phone))throw err(functions,"already-exists","Ese teléfono ya está registrado en la plantilla.");
        const prev=ms.exists?ms.data()||{}:{};if([platform.B2C_CREW_MEMBER_STATES.ACTIVE,platform.B2C_CREW_MEMBER_STATES.SUSPENDED].includes(prev.status))throw err(functions,"failed-precondition","Ese integrante no puede reemplazar su expediente desde este estado.");
        const ts=now();
        tx.set(memberRef,{member_id:memberId,provider_uid:providerId,full_name:fullName,role,phone_digits:phone,status:platform.B2C_CREW_MEMBER_STATES.PENDING_REVIEW,approved:false,active:false,on_duty:false,verification_status:"pending_biometric",profile_photo_url:entries.profile_photo.url,evidence:entries,identity:{machine_status:"pending_capture",machine_verified:false,duplicate_suspected:false},created_at:prev.created_at||ts,updated_at:ts,submitted_at:ts});
        tx.update(providerRef,{"provider_profile.planned_member_count":Math.min(platform.B2C_PROVIDER_MAX_MEMBERS,Math.max(Number(provider.planned_member_count)||2,activeRosterCount+(ms.exists?1:2))),"provider_profile.max_member_count":platform.B2C_PROVIDER_MAX_MEMBERS,"provider_profile.updated_at":ts});
        return{ok:true,memberId,status:"pending_biometric"};
      });
    }
    if(action==="set_on_duty"||action==="deactivate") return db.runTransaction(async tx=>{
      const [ps,ms]=await Promise.all([tx.get(providerRef),tx.get(memberRef)]);if(!ps.exists||!ms.exists)throw err(functions,"not-found","Integrante no encontrado.");assertProvider(functions,ps.data()||{});
      const m=ms.data()||{};if(m.provider_uid!==providerId)throw err(functions,"permission-denied","Integrante ajeno.");
      if(action==="set_on_duty"){if(m.status!==platform.B2C_CREW_MEMBER_STATES.ACTIVE||m.approved!==true)throw err(functions,"failed-precondition","Sólo integrantes aprobados pueden ponerse en turno.");tx.update(memberRef,{on_duty:data?.onDuty===true,updated_at:now()});return{ok:true,memberId,onDuty:data?.onDuty===true};}
      const active=m.status===platform.B2C_CREW_MEMBER_STATES.ACTIVE;tx.update(memberRef,{status:platform.B2C_CREW_MEMBER_STATES.INACTIVE,approved:false,active:false,on_duty:false,updated_at:now()});if(active)tx.update(providerRef,{"provider_profile.active_member_count":Math.max(0,Number(ps.data()?.provider_profile?.active_member_count||0)-1),"provider_profile.updated_at":now()});return{ok:true,memberId,status:"inactivo"};
    });
    throw err(functions,"invalid-argument","Acción de plantilla inválida.");
  };
}

function createVerifyB2cCrewIdentityHandler({admin,db,functions,bucket,runtimeFactory=biometric.createHumanBiometricRuntime}){
  const now=()=>admin.firestore.FieldValue.serverTimestamp();
  return async(data,context)=>{
    const providerId=context?.auth?.uid;if(!providerId)throw err(functions,"unauthenticated","Inicia sesión como responsable B2C.");
    const memberId=clean(data?.memberId,100);if(!/^[A-Za-z0-9_-]{8,100}$/.test(memberId))throw err(functions,"invalid-argument","memberId inválido.");
    const providerRef=db.collection("users").doc(providerId), memberRef=providerRef.collection("crew_members").doc(memberId);
    const [ps,ms]=await Promise.all([providerRef.get(),memberRef.get()]);if(!ps.exists||!ms.exists)throw err(functions,"not-found","Proveedor o integrante no encontrado.");assertProvider(functions,ps.data()||{});
    const member=ms.data()||{};if(member.provider_uid!==providerId)throw err(functions,"permission-denied","Integrante ajeno.");if(![platform.B2C_CREW_MEMBER_STATES.PENDING_REVIEW,platform.B2C_CREW_MEMBER_STATES.CORRECTION_REQUIRED].includes(member.status))throw err(functions,"failed-precondition","La identidad sólo puede verificarse mientras el integrante está pendiente o corrigiendo.");
    const evidence={};for(const kind of ["profile_photo","ine_front","ine_back"]){const saved=member.evidence?.[kind];if(!saved?.storage_path)throw err(functions,"failed-precondition","Falta evidencia del integrante.");evidence[kind]=await verifyEvidence(bucket,providerId,memberId,kind,saved.storage_path,saved.generation);}
    const buffers=await downloadBuffers(bucket,evidence), digest=biometric.captureDigest(buffers), key=subjectKey(providerId,memberId), attemptsRef=db.collection("b2c_identity_attempts").doc(key);
    await db.runTransaction(async tx=>{const a=await tx.get(attemptsRef), decision=biometric.evaluateIdentityAttemptState(a.exists?a.data()||{}:{},{nowMs:Date.now(),digest});if(!decision.allowed)throw err(functions,"resource-exhausted","Espera antes de repetir la verificación.",{reason:decision.reason,retryAfterMs:decision.retryAfterMs});tx.set(attemptsRef,{uid:key,subject_type:"crew_member",provider_uid_hash:crypto.createHash("sha256").update(providerId).digest("hex"),...decision.patch,updated_at:now()},{merge:true});});
    let runtime,assessment;try{runtime=await runtimeFactory();const analyses={ine_front:await runtime.analyze(buffers.ine_front),selfie_front:await runtime.analyze(buffers.selfie_front)};assessment=biometric.assessCustomerIdentityAnalyses({analyses,similarity:runtime.similarity,strictDocumentMatch:true});}catch(e){assessment={status:"review_required",reasons:["BIOMETRIC_ENGINE_UNAVAILABLE"],metrics:{}};}
    const registryRef=db.collection("b2c_identity_registry").doc(key), auditRef=db.collection("b2c_identity_audit").doc();
    return db.runTransaction(async tx=>{
      const registry=await tx.get(db.collection("b2c_identity_registry").limit(biometric.REGISTRY_LIMIT+1));if(registry.size>biometric.REGISTRY_LIMIT){tx.update(memberRef,{identity:{machine_status:"review_required",machine_verified:false,duplicate_suspected:false,reasons:["IDENTITY_REGISTRY_CAPACITY_REVIEW_REQUIRED"],checked_at:now(),capture_digest:digest,engine_version:biometric.BIOMETRIC_ENGINE_VERSION}});return{ok:true,status:"review_required"};}
      let status=assessment.status,reasons=[...(assessment.reasons||[])],duplicate=null;
      if(status==="verified"){duplicate=biometric.bestRegistryMatch(registry.docs,assessment.embedding,runtime.similarity,key);if(duplicate?.similarity>=biometric.THRESHOLDS.duplicateSuspected){status="duplicate_suspected";reasons.push("IDENTITY_DUPLICATE_SUSPECTED");}else if(duplicate?.similarity>=biometric.THRESHOLDS.duplicateReview){status="review_required";reasons.push("IDENTITY_SIMILARITY_REVIEW_REQUIRED");}}
      const ts=now();tx.update(memberRef,{verification_status:status==="verified"?"pending_admin_review":status,identity:{machine_status:status,machine_verified:status==="verified",duplicate_suspected:status==="duplicate_suspected",reasons,metrics:assessment.metrics||{},checked_at:ts,capture_digest:digest,engine_version:biometric.BIOMETRIC_ENGINE_VERSION,identity_version:biometric.IDENTITY_CAPTURE_VERSION}});
      if(status==="verified")tx.set(registryRef,{uid:key,subject_type:"crew_member",provider_uid_hash:crypto.createHash("sha256").update(providerId).digest("hex"),member_id_hash:crypto.createHash("sha256").update(memberId).digest("hex"),status:"pending_admin_review",embedding:assessment.embedding,capture_digest:digest,engine_version:biometric.BIOMETRIC_ENGINE_VERSION,identity_version:biometric.IDENTITY_CAPTURE_VERSION,created_at:ts,updated_at:ts},{merge:true});
      tx.set(auditRef,{uid:key,subject_type:"crew_member",status,reasons,metrics:assessment.metrics||{},capture_digest:digest,duplicate_similarity:duplicate?Number(duplicate.similarity.toFixed(6)):null,duplicate_candidate_hash:duplicate?crypto.createHash("sha256").update(String(duplicate.uid)).digest("hex"):null,engine_version:biometric.BIOMETRIC_ENGINE_VERSION,identity_version:biometric.IDENTITY_CAPTURE_VERSION,created_at:ts});
      return{ok:true,status,reasons,metrics:assessment.metrics||{}};
    });
  };
}

function createReviewB2cProviderCrewMemberHandler({admin,db,functions,bucket}){
  const now=()=>admin.firestore.FieldValue.serverTimestamp();
  return async(data,context)=>{
    if(!context?.auth?.uid)throw err(functions,"unauthenticated","Se requiere sesión administrativa.");const actorSnap=await db.collection("users").doc(context.auth.uid).get();if(!isAuthorizedAdmin(context,actorSnap.data()||{}))throw err(functions,"permission-denied","Sólo Administración puede revisar integrantes.");
    const providerId=clean(data?.providerId,160),memberId=clean(data?.memberId,100),action=clean(data?.action,40);if(!providerId||providerId.includes("/"))throw err(functions,"invalid-argument","providerId inválido.");
    const providerRef=db.collection("users").doc(providerId),ps=await providerRef.get();if(!ps.exists||ps.data()?.tipo_cuenta!=="B2C"||platform.normalizeToken(ps.data()?.rol)!=="tecnico")throw err(functions,"not-found","Proveedor B2C no encontrado.");
    if(action==="list"){const q=await providerRef.collection("crew_members").limit(100).get();return{ok:true,provider:platform.normalizeB2cProviderProfile(ps.data()||{}),members:q.docs.map(x=>memberPublic(x,true)).filter(x=>x.status!==platform.B2C_CREW_MEMBER_STATES.INACTIVE)};}
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(memberId))throw err(functions,"invalid-argument","memberId inválido.");const memberRef=providerRef.collection("crew_members").doc(memberId),ms=await memberRef.get();if(!ms.exists)throw err(functions,"not-found","Integrante no encontrado.");const m=ms.data()||{}, reason=clean(data?.reason,500);
    if(action==="approve"){if(![platform.B2C_CREW_MEMBER_STATES.PENDING_REVIEW,platform.B2C_CREW_MEMBER_STATES.CORRECTION_REQUIRED].includes(m.status))throw err(functions,"failed-precondition","El integrante no está en estado aprobable.");if(m.identity?.machine_verified!==true||m.identity?.machine_status!=="verified")throw err(functions,"failed-precondition","La identidad biométrica del integrante no está verificada.");const key=subjectKey(providerId,memberId),reg=await db.collection("b2c_identity_registry").doc(key).get();if(!reg.exists||reg.data()?.status!=="pending_admin_review"||reg.data()?.capture_digest!==m.identity?.capture_digest)throw err(functions,"failed-precondition","Sello biométrico de integrante inválido.");}
    if(action==="return"&&reason.length<8)throw err(functions,"invalid-argument","Explica qué debe corregirse.");if(!["approve","return","suspend"].includes(action))throw err(functions,"invalid-argument","Decisión inválida.");
    return db.runTransaction(async tx=>{const [fps,fms]=await Promise.all([tx.get(providerRef),tx.get(memberRef)]);if(!fps.exists||!fms.exists)throw err(functions,"not-found","Proveedor o integrante no encontrado.");const cur=fms.data()||{},ts=now(),count=Number(fps.data()?.provider_profile?.active_member_count||0),key=subjectKey(providerId,memberId),regRef=db.collection("b2c_identity_registry").doc(key);
      if(action==="approve"){if(![platform.B2C_CREW_MEMBER_STATES.PENDING_REVIEW,platform.B2C_CREW_MEMBER_STATES.CORRECTION_REQUIRED].includes(cur.status))throw err(functions,"failed-precondition","El integrante ya no está en estado aprobable.");if(cur.identity?.machine_verified!==true||cur.identity?.machine_status!=="verified")throw err(functions,"failed-precondition","Identidad no verificada.");tx.update(memberRef,{status:platform.B2C_CREW_MEMBER_STATES.ACTIVE,approved:true,active:true,on_duty:false,verification_status:"admin_approved",approved_by:context.auth.uid,approved_at:ts,updated_at:ts,review_reason:null});tx.update(providerRef,{"provider_profile.active_member_count":Math.min(platform.B2C_PROVIDER_MAX_MEMBERS-1,count+1),"provider_profile.updated_at":ts});tx.set(regRef,{status:"active",updated_at:ts},{merge:true});return{ok:true,memberId,status:"activo"};}
      if(action==="return"){if(cur.status===platform.B2C_CREW_MEMBER_STATES.ACTIVE)throw err(functions,"failed-precondition","Un integrante activo debe suspenderse.");tx.update(memberRef,{status:platform.B2C_CREW_MEMBER_STATES.CORRECTION_REQUIRED,approved:false,active:false,on_duty:false,verification_status:"correction_required",reviewed_by:context.auth.uid,reviewed_at:ts,updated_at:ts,review_reason:reason});return{ok:true,memberId,status:"correccion_requerida"};}
      const was=cur.status===platform.B2C_CREW_MEMBER_STATES.ACTIVE;tx.update(memberRef,{status:platform.B2C_CREW_MEMBER_STATES.SUSPENDED,approved:false,active:false,on_duty:false,verification_status:"suspended",reviewed_by:context.auth.uid,reviewed_at:ts,updated_at:ts,review_reason:reason||"Suspensión administrativa"});if(was)tx.update(providerRef,{"provider_profile.active_member_count":Math.max(0,count-1),"provider_profile.updated_at":ts});tx.set(regRef,{status:"active",operational_status:"suspended",updated_at:ts},{merge:true});return{ok:true,memberId,status:"suspendido"};
    });
  };
}
module.exports={B2C_PROVIDER_CREW_VERSION,createManageB2cProviderCrewHandler,createVerifyB2cCrewIdentityHandler,createReviewB2cProviderCrewMemberHandler,verifyEvidence,subjectKey};
