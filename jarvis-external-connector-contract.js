// V142 external integrations: truthful authorization inventory, NOT an OAuth engine.
// No credentials, session tokens, browser cookies or provider API writes are handled here.
// Only a future authenticated provider-specific callback and API probe may turn these on.
export const EXTERNAL_CONNECTOR_CATALOG=Object.freeze([
 {id:'gmail',family:'email',auth:'oauth2',operations:['mail.list','mail.read','mail.draft','mail.send']},
 {id:'microsoft-outlook',family:'email',auth:'oauth2',operations:['mail.list','mail.read','mail.draft','mail.send']},
 {id:'zoho-mail',family:'email',auth:'oauth2',operations:['mail.list','mail.read','mail.draft','mail.send']},
 {id:'facebook-pages',family:'social',auth:'meta-oauth',operations:['pages.inspect','pages.posts.read','pages.posts.publish']},
 {id:'instagram-business',family:'social',auth:'meta-oauth',operations:['instagram.inspect','instagram.media.read','instagram.media.publish']},
 {id:'google-drive',family:'workspace',auth:'oauth2',operations:['drive.search','drive.read','drive.create']},
 {id:'google-calendar',family:'workspace',auth:'oauth2',operations:['calendar.read','calendar.create']},
 {id:'tiktok-business',family:'social',auth:'oauth2',operations:['tiktok.profile.read','tiktok.videos.read','tiktok.videos.publish']}
]);
const writeOperation=operation=>/(?:send|publish|create|draft)$/iu.test(operation);
export function pendingExternalConnectorInventory(){
 const connectors=EXTERNAL_CONNECTOR_CATALOG.map(source=>({
  id:source.id,family:source.family,authorization:source.auth,
  status:'OAUTH_NOT_CONFIGURED',connected:false,verified:false,
  readAllowed:false,writeAllowed:false,
  availableOperations:[],
  candidateReadOperations:source.operations.filter(s=>!writeOperation(s)),
  candidateWriteOperations:source.operations.filter(writeOperation),
  userAuthorizationRequired:true,humanApprovalRequiredForWrites:true,
  tokenPresent:false,
  evidence:null
 }));
 return {status:'EXTERNAL_OAUTH_AUTHORIZATION_REQUIRED',verified:false,
  connectedCount:0,connectorCount:connectors.length,connectors};
}
export function proposedExternalOperation(providerId,operation,readiness=pendingExternalConnectorInventory()){
 const provider=EXTERNAL_CONNECTOR_CATALOG.find(p=>p.id===providerId);
 if(!provider||!provider.operations.includes(operation))return {ok:false,reason:'EXTERNAL_OPERATION_NOT_REGISTERED'};
 const status=readiness.connectors?.find(p=>p.id===providerId);
 if(!status||status.verified!==true||status.connected!==true||!status.availableOperations?.includes(operation))
  return {ok:false,reason:'EXTERNAL_CONNECTOR_NOT_AUTHORIZED'};
 if(writeOperation(operation))return {ok:false,reason:'EXTERNAL_WRITE_REQUIRES_SPECIFIC_HUMAN_APPROVAL'};
 return {ok:true,readOnly:true};
}
