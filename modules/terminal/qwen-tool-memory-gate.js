// Narrow shortcut: only explicit questions about previously executed tools.
// New multi-step work must be sent to the authenticated Jarvis mission engine.
export function isExplicitToolMemoryQuestion(input=''){
  const raw=String(input||'').trim();
  if(!raw||raw.length>260)return false;
  const s=raw.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase()
    .replace(/[¿?¡!]/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(?:audita|auditar|analiza|analizar|investiga|investigar|ejecuta|ejecutar|corre|correr|crea|crear|genera|generar|repara|reparar|modifica|modificar|prepara|preparar|prueba|probar|compara|comparar)\b/iu.test(s)) {
    // "prueba" on its own can be a noun; reject direct action verbs at start
    // and any long task with specific tool calls.
    if(/^(?:audita|auditar|analiza|analizar|investiga|investigar|ejecuta|ejecutar|corre|correr|crea|crear|genera|generar|repara|reparar|modifica|modificar|prepara|preparar|prueba|probar|compara|comparar)\b/iu.test(s)||
       /\b(?:repo\.grep|repo\.read|tests\.run|system\.capabilities)\b/iu.test(s))return false;
  }
  const past = /\b(?:ultimo|ultima|ultimos|ultimas|anterior|anteriores|antes|ayer|corriste|ejecutaste|pasaron|fallaron|tardo|reciente)\b/iu;
  const test = /\b(?:prueba|pruebas|test|tests|comando|comandos|resultado|resultados)\b/iu;
  if(!past.test(s)||!test.test(s))return false;
  return /^(?:(?:el|la|los|las)\s+)?(?:pruebas|tests?|comando|resultado)\b/iu.test(s)||
    /^(?:dime|muestra|muestrame|recuerda|recuerdame|cual|cuales|como|cuanto|que|ya|pasaron|fallaron)\b/iu.test(s);
}
