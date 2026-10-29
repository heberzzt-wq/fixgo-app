/**
 * Península Tech / ADJUNTO — códigos operativos V142.
 * The catalog translates existing error receipts; it NEVER invents evidence,
 * retries a mission, changes permissions or infers intent from user prompts.
 *
 * Families: 1xx local/semantic, 2xx private relay, 3xx browser/web,
 * 4xx planner/tools, 5xx evidence, 6xx artifacts, 9xx unknown.
 * Published codes are stable even when the underlying error text changes.
 */
export const JARVIS_ERROR_CATALOG_VERSION = 'v142-2026-10-28';
const rows = [
  ['JAR-101', ['JARVIS_LOCAL_BRIDGE_TRANSPORT_STALLED','JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST'],
    'El Bridge dejó de responder', 'Se interrumpió la comunicación local.',
    'Revisa el estado de los servicios locales y su conexión; no reenvíes una operación sin conocer su estado.', 'local'],
  ['JAR-102', ['LOCAL_SEMANTIC_RESPONSE_EMPTY','SEMANTIC_RESPONSE_EMPTY','SEMANTIC_RESPONSE_INCOMPLETE'],
    'Qwen no entregó una respuesta completa', 'La inferencia terminó sin una respuesta utilizable.',
    'Conserva el recibo de inferencia y revisa el plan antes de iniciar otra misión.', 'modelo'],
  ['JAR-103', ['SEMANTIC_PROVIDER_TIMEOUT','LOCAL_SEMANTIC_TIMEOUT','LOCAL_SEMANTIC_STREAM_INCOMPLETE'],
    'La inferencia no terminó correctamente', 'Hubo un tiempo de espera o una transmisión incompleta.',
    'Consulta la actividad y el recibo antes de repetir; podría haberse ejecutado parcialmente.', 'modelo'],
  ['JAR-201', ['JARVIS_RELAY_WORKSTATION_UNAVAILABLE','JARVIS_RELAY_LOCAL_HEALTH_REQUIRED'],
    'La laptop no está enlazada', 'Firebase no detecta una estación autorizada activa.',
    'En la laptop abre una sola Terminal local y verifica que la cadena de enlace esté verde.', 'relay'],
  ['JAR-202', ['JARVIS_RELAY_LEASE_HELD'],
    'Otra Terminal conserva el enlace', 'La estación actual no pudo adquirir el registro privado.',
    'Comprueba si otra pestaña autorizada mantiene el enlace; evita duplicar estaciones.', 'relay'],
  ['JAR-203', ['JARVIS_RELAY_LOCAL_RELEASE_MISMATCH','JARVIS_RELAY_RELEASE_MISMATCH'],
    'Las versiones no coinciden', 'La Terminal, el Bridge o el relay presentan distintas versiones.',
    'Verifica el SHA certificado en ambos lados; no saltes la comprobación de identidad.', 'relay'],
  ['JAR-204', ['JARVIS_RELAY_RESPONSE_TOO_LARGE'],
    'Respuesta demasiado grande', 'El resultado superó el límite seguro del relay.',
    'Entrega un resumen o segmenta la evidencia desde la herramienta; conserva los originales locales.', 'relay'],
  ['JAR-205', ['JARVIS_RELAY_RESULT_UNCONFIRMED','JARVIS_RELAY_REQUEST_CANCELLED'],
    'La entrega no fue confirmada', 'El enlace perdió la confirmación del resultado o se canceló la solicitud.',
    'Consulta el expediente antes de reenviar: la operación pudo haberse ejecutado.', 'relay'],
  ['JAR-206', ['JARVIS_RELAY_OWNER_REQUIRED','JARVIS_RELAY_OWNER_TOKEN_REQUIRED','JARVIS_RELAY_SUBMISSION_FAILED'],
    'Sesión privada sin autorización', 'La identidad o el permiso de Firestore no fue confirmado.',
    'Comprueba la sesión autorizada del propietario en la laptop; no compartas tokens.', 'seguridad'],
  ['JAR-207', ['JARVIS_RELAY_REQUEST_EXPIRED'],
    'Solicitud vencida', 'La cola superó la vigencia autorizada.',
    'Verifica que no exista una ejecución pendiente antes de reenviar.', 'relay'],
  ['JAR-208', ['JARVIS_MOBILE_PRIVATE_RELAY_NOT_ENABLED','JARVIS_MOBILE_RELAY_ROUTE_NOT_ALLOWED','JARVIS_RELAY_LOCAL_OPERATION_REQUIRED'],
    'Operación no permitida en móvil', 'El canal móvil no autoriza esa operación.',
    'Usa el canal autorizado; no amplíes permisos ni abras un puente público.', 'seguridad'],
  ['JAR-301', ['PUBLIC_HTML_ACCESS_DENIED'],
    'Sitio externo negó la lectura', 'La página respondió con una restricción de acceso.',
    'Busca una fuente independiente accesible, sin intentar evadir el bloqueo.', 'web'],
  ['JAR-302', ['BROWSER_COMMAND_FAILED','BROWSER_PROCESS_FAILED'],
    'Falló la herramienta de navegador', 'El navegador no completó la operación solicitada.',
    'Revisa el paso y su recibo; conserva la página y el error original.', 'web'],
  ['JAR-303', ['ENOTEMPTY'],
    'Carpeta temporal ocupada', 'Windows mantuvo archivos del navegador abiertos durante la limpieza.',
    'Revisa la limpieza aislada y no borres evidencias de otras misiones.', 'web'],
  ['JAR-401', ['REPEATED_TOOL_CALL'],
    'Herramienta repetida', 'El plan intentó repetir una llamada sin avance verificable.',
    'Conserva el último recibo y cambia de fuente o de acción solo con nueva evidencia.', 'planificador'],
  ['JAR-402', ['PLANNER_UNAVAILABLE','SEMANTIC_PLANNER_UNAVAILABLE'],
    'Planificador no disponible', 'No se obtuvo un plan utilizable.',
    'Consulta el error de la fase original; este mensaje puede ser consecuencia de otro fallo.', 'planificador'],
  ['JAR-403', ['SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED'],
    'Faltan argumentos válidos', 'La herramienta no recibió los parámetros exigidos por su contrato.',
    'Revisa selección de herramienta, esquema y evidencia antes de completar argumentos.', 'planificador'],
  ['JAR-404', ['LOCAL_SEMANTIC_PLAN_REQUIRED'],
    'Falta recibo de planificación local', 'No se demostró una planificación válida del Qwen autorizado.',
    'No simules otra inferencia. Comprueba el recibo de Qwen y la selección original.', 'planificador'],
  ['JAR-405', ['PLANNER_RECOVERY_EXHAUSTED'],
    'Se agotó la recuperación del plan', 'No quedan alternativas justificadas dentro de esta misión.',
    'Entrega un resultado parcial honesto con los bloqueos exactos.', 'planificador'],
  ['JAR-501', ['EVIDENCE_SEGMENTATION_REQUIRED','REPO_AUDIT_RELAY_EVIDENCE_PARTIAL'],
    'Evidencia incompleta o muy grande', 'No se entregó toda la evidencia requerida.',
    'Segmenta el trabajo y conserva el original; nunca declares éxito parcial como completo.', 'evidencia'],
  ['JAR-502', ['ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED','SEMANTIC_GROUNDED_SOURCE_EVIDENCE_REQUIRED',
    'THREE_OPENED_CITED_URLS_REQUIRED','SOURCE_QUOTATIONS_AND_TITLES_REQUIRED','UNSUPPORTED_REPORT_ASSERTIONS'],
    'Faltan fuentes verificables', 'La investigación no acreditó las fuentes necesarias.',
    'Consulta fuentes pertinentes y guarda sus recibos antes de certificar.', 'evidencia'],
  ['JAR-503', ['RESEARCH_PROCEDURE_STEPS_REQUIRED','RESEARCH_PROCEDURE_WARNINGS_REQUIRED'],
    'Procedimiento solicitado incompleto', 'La investigación carece de pasos o advertencias sustentados con citas verificables.',
    'Comprueba las instrucciones y advertencias pendientes contra las páginas inspeccionadas; conserva PARTIAL si faltan citas.', 'evidencia'],
  ['JAR-601', ['ARTIFACT_READ_FAILED','ARTIFACT_WRITE_FAILED','FILE_NOT_FOUND'],
    'Archivo no disponible', 'No se confirmó lectura o entrega del artefacto.',
    'Comprueba el identificador y el recibo del archivo, sin inventar una descarga.', 'archivos']
];
const catalog=rows.map(([code, signatures, title, cause, action, family])=>
  Object.freeze({code,signatures:Object.freeze(signatures),title,cause,action,family}));
export const JARVIS_ERROR_CATALOG=Object.freeze(catalog);

function readableError(error) {
    if (typeof error==='string') return error.slice(0,1200);
    if (error && typeof error==='object') {
        const values=[error.code,error.reason,error.status,error.message,error.error?.code,error.error?.message];
        return values.filter(x=>typeof x==='string').join(' ').slice(0,1200);
    }
    return String(error??'').slice(0,1200);
}
export function diagnoseJarvisError(error, {traceId='', phase=''}={}) {
    const input=readableError(error).toUpperCase();
    const entry=catalog.find(row=>row.signatures.some(signature=>input.includes(signature)))||null;
    // Technical codes are diagnostics, not authority or proof of mission completion.
    const raw=entry?.signatures.find(signature=>input.includes(signature))||'UNKNOWN';
    return Object.freeze({
        code:entry?.code||'JAR-900',
        title:entry?.title||'Fallo pendiente de clasificación',
        cause:entry?.cause||'No hay un código específico para este error.',
        action:entry?.action||'Conserva el identificador de misión y el diagnóstico original para investigar sin repetir la operación.',
        family:entry?.family||'desconocido',
        technicalCode:raw,
        traceId:String(traceId||'').slice(0,80),
        phase:String(phase||'').slice(0,70),
        catalogVersion:JARVIS_ERROR_CATALOG_VERSION,
        certified:false
    });
}
export function jarvisErrorPublicMessage(error, options={}) {
    const d=diagnoseJarvisError(error,options);
    return d.code+' · '+d.title+'\n'+d.cause+'\nAcción: '+d.action+'\nError técnico: '+d.technicalCode;
}
