// No unregistered browser tool may be executed to answer ordinary text.
// Text-only conversations are separated from executable, certified missions.
export function classifyEmptyGeneralCatalog(instruction){
 const text=String(instruction||'').trim();
 if(!text)return 'INVALID';
 const greeting=/^(?:¡?hola|buenas(?:\s+(?:tardes|noches))?|buenos\s+d[ií]as|hey|saludos|gracias|adi[oó]s|qu[eé]\s+tal|c[oó]mo\s+est[aá]s)[\s!¡?¿.]*$/iu;
 const question=/^[¿\s]*(?:qu[eé]|qui[eé]n|cu[aá]l|c[oó]mo|por\s+qu[eé]|para\s+qu[eé]|cu[aá]ndo|d[oó]nde|cu[aá]nto)(?=\s|[?¿!.,]|$)/iu;
 const explanatory=/^(?:expl[ií]ca(?:me)?|define|descr[ií]be|dime\s+qu[eé]\s+es)\b/iu;
 if(greeting.test(text)||question.test(text)||explanatory.test(text))return 'CONVERSATION';
 // A text-only request can be an instruction, not necessarily a question.
 // But a requested external effect or concrete downloadable artifact is not
 // silently reclassified as a completed conversational task.
 const action=/\b(?:crea|crear|genera|generar|descarga|descargar|exporta|exportar|entrega|entregar|produce|producir|construye|desarrolla|desarrollar|modifica|modificar|borra|borrar|aplica|aplicar|ejecuta|ejecutar|env[ií]a|enviar|haz|prepara|preparar)\b/iu;
 const tangible=/\b(?:imagen|im[aá]genes|png|v[ií]deo|video|mp4|pdf|word|docx|excel|xlsx|pptx|powerpoint|archivo|archivos|aplicaci[oó]n|app|sitio\s+web|landing|html|captura|screenshot|base\s+de\s+datos|repositorio|c[oó]digo|parche|patch)\b/iu;
 const sensitive=/\b(?:paga|pagar|transfiere|transferir|publica|publicar|despliega|desplegar|elimina\s+(?:una?\s+)?cuenta)\b/iu;
 if((action.test(text)&&tangible.test(text))||sensitive.test(text))return 'UNSUPPORTED_MISSION';
 return 'CONVERSATION';
}
export async function requestQwenGeneralConversation({instruction,selectAction,signal,history=[]}={}){
 if(classifyEmptyGeneralCatalog(instruction)!=='CONVERSATION'||typeof selectAction!=='function')
    throw Error('QWEN_CONVERSATION_INPUT_INVALID');
 signal?.throwIfAborted?.();
 const previous=Array.isArray(history)?history.slice(-8).filter(t=>['user','assistant'].includes(t?.role)&&typeof t.text==='string').map(t=>t.role+': '+t.text.slice(0,1200)).join('\n'):'';
 const decision=await selectAction({
  instruction:'Responde en español a esta consulta de conversación general. Eres Jarvis, con Qwen3.5:9b local. No tienes herramientas habilitadas para esta interacción: NO afirmes haber accedido a cuentas, archivos, fuentes, procesos ni haber generado descargas. Si hacen falta datos actuales o privados, indícalo sin inventar. Ejecuta directamente los cambios textuales que el usuario ya pidió, sin solicitar permiso otra vez. Contesta completo, sin prólogos como He recibido, sin acabar a mitad de frase, máximo 850 caracteres. Si pide tres días, incluye día 1, 2 y 3. Conserva preferencias y hechos del hilo, no inventes lugares concretos no verificados. Historial de esta conversación (no inventes turnos ausentes): '+previous+'\nConsulta actual: '+instruction,
  tools:[{name:'conversation.reply',description:'Devuelve únicamente una respuesta conversacional; NO es una herramienta ejecutable ni certifica acciones.',
   inputSchema:{type:'object',properties:{text:{type:'string',minLength:1,maxLength:1600}},
    required:['text'],additionalProperties:false}}],
  observations:[],evidenceSummary:{finishEligible:false},missionLedger:null,iteration:0,signal
 });
 const content=decision?.toolCall?.name==='conversation.reply'?decision.toolCall.args?.text:null;
 if(typeof content!=='string'||!content.trim()||content.length>1600)
   throw Error('QWEN_CONVERSATION_REPLY_INVALID');
 return content.trim();
}

export function unsupportedDownloadFormatRequest(instruction){
 const s=String(instruction||'');
 const action=/\b(?:crea|crear|genera|generar|entrega|entregar|descarga|descargar|exporta|exportar|guarda|guardar|produce|producir)\b/iu;
 const format=/\b(?:pdf|docx|xlsx|pptx|csv)\b/iu;
 return action.test(s)&&format.test(s);
}
