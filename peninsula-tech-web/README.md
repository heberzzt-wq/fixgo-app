# Peninsula Tech / ADJUNTO v0.1

Sitio estatico de desarrollo independiente. No es el servicio operativo de Jarvis ni la web de MPH.

## Regla de costos
Solo Firebase Spark, sin cuenta de facturacion. NO desplegar a fixgo-44e4d (Blaze), NO activar App Hosting, Cloud Run, Functions, bases de datos, Analytics ni APIs de IA. No se compra dominio. Si Firebase exige facturacion, detenerse.

## Proyecto y sitio
Proyecto previsto: peninsula-tech-v01. Hosting target: peninsula-tech. Ver docs/CONTINUAR.json para saber si ya se creo y verifico Spark; no asumir despliegue por la existencia de esta configuracion.

## Guardado
Rama: peninsula-tech-v0.1, carpeta: peninsula-tech-web/. El worktree de Codex permanece separado; no cancelar su apagado ni cambiar su rama.

## Verificacion
Desde esta carpeta: node scripts/verify-static.mjs
Pruebas de navegador: node scripts/qa-browser.mjs http://127.0.0.1:8787/

## Despliegue condicionado
Comprobar en la consola del proyecto EXACTO que el plan es Spark y no tiene facturacion. Entonces, desde ESTA carpeta:

    firebase deploy --config firebase.json --project peninsula-tech-v01 --only hosting:peninsula-tech --account heberzzt@gmail.com --non-interactive

El predeploy rechaza un proyecto distinto. Nunca ejecutar firebase deploy en la raiz del repo ni sin --only. Las credenciales se administran fuera del repo por Firebase CLI; no guardar secretos ni registros de autenticacion.

## Alcance y privacidad
Carrusel, 12 categorias propuestas, galeria historica y borradores de blog. Los formularios son demostracion local: no registran personas, no cobran y no envian datos. El enlace web es publico; noindex NO es contrasena ni privacidad. Las fotos historicas no representan servicios ejecutados por ADJUNTO. Confirmar derechos antes del lanzamiento comercial.

## Referencias
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
https://firebase.google.com/docs/hosting/usage-quotas-pricing

## Originales
Los PNG historicos permanecen en docs/originales-no-publicados; Hosting sirve exclusivamente public/.
