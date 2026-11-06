# BichO V3 · Implementación y entrega segura

Rama: `codex/bicho-v3`, basada en V2 (`codex/personal-space-v2-staging`, PR #2). V3 se entrega en un PR en borrador; no se fusiona ni se promociona automáticamente.

## Entornos

- Talorys original: `talorys-etfd7yab-*`. Fuera del alcance de cualquier comando de V3.
- V2 funcional: `talorys-psstta2bu4wy-*`. URL final reservada: https://talorys-psstta2bu4wy-web.pages.dev. No se sustituye sin aprobación explícita.
- Preview V3: nombre generado `talorys-biv3xxxxxxxx-*`, directorio local ignorado `.personal-space/v3`. Worker, Durable Object SQLite, secretos, Pages, sesiones y push independientes. Solo datos ficticios.

`npm run v3:prepare` compila la interfaz real y el Worker. `npm run v3:deploy` abre un formulario de contraseña local con ruta aleatoria, Host/Origin/CSRF y sin almacenamiento de la contraseña. Usa OAuth de Wrangler ya autorizado. Si necesita autorización, ejecutar `npx wrangler login` y completar el flujo del navegador; no pegar credenciales en el chat. No usa `npx create-talorys@latest` para actualizar BichO.

El guard de V3 rechaza los prefijos de V2 y producción, un Worker público, rutas, enlaces a almacenamiento externo y una web cuyo service binding no corresponda a su Worker. No crea recursos facturables adicionales: Pages, Worker, Durable Object SQLite y Workers AI, sin Vectorize, R2, KV ni servicios de terceros. No activa planes de pago; los límites del plan gratuito y la cuota gratuita de Workers AI siguen aplicándose. Si se agotan, se informa del error y no se sustituye el proveedor. Si la cuenta ya tiene un plan de pago, sus condiciones de consumo pertenecen a la cuenta: este instalador no cambia ese plan ni garantiza que el gasto histórico sea cero.

### Alta desde el iPhone

`npm run v3:mobile` crea exclusivamente una instalación nueva. Su acceso temporal aleatorio solo vive en la memoria del proceso; permite ejecutar las pruebas reales antes de entregar la preview. No imprime ni escribe esa contraseña en archivos. El proceso debe permanecer abierto hasta activar al propietario.

La pantalla HTTPS de la preview permite elegir una contraseña y devuelve un UUID de solicitud (no es una credencial). El servidor conserva solo su hash PBKDF2 durante 15 minutos, con un máximo global de cinco solicitudes por ventana, reservado antes de calcular el hash. Una solicitud pública **nunca** concede acceso. El propietario comunica ese UUID en el chat; el operador lo aprueba desde la sesión temporal autenticada. La activación instala únicamente el hash seleccionado, elimina las solicitudes, revoca todas las sesiones y tokens temporales y cierra permanentemente el alta. El propietario actualiza la página e inicia sesión con la contraseña que eligió. El proceso verifica que el acceso temporal y el alta han quedado deshabilitados.

Este flujo exige `BICHO_ENROLLMENT=1` y un ID `biv3xxxxxxxx`; no puede habilitarse en V2 o Talorys original. No requiere permisos Cloudflare Access ni comparte contraseñas por el chat. Si se interrumpe el proceso, `npm run v3:mobile -- --resume-unclaimed` comprueba por HTTPS que el alta sigue abierta antes de rotar únicamente la contraseña temporal; rechaza una preview ya activada. Nunca recrea el almacenamiento. Los UUID caducados requieren una nueva solicitud desde el iPhone.

## Módulos

- `tal_lists` y `tal_list_items`: casillas booleanas, posición, nombres y textos normalizados para deduplicar, edición y eliminación confirmada. Operaciones SQL transaccionales. Máximo 200 listas, 500 elementos por lista. Refresco en foco y cada 30 segundos; requiere conexión.
- Herramientas reales de clasificación: listas, cumpleaños, enlaces, eventos, tareas, notas y avisos. El prompt decide intención pero las escrituras son herramientas validadas con Zod y SQLite. Se pide aclaración ante datos esenciales ambiguos. Una acción independiente puede completarse aunque otra necesite aclaración.
- Los eventos comprueban además el horario contra el texto real del usuario: una hora/duración inventada por la IA no basta. La comprobación es conservadora y puede pedir repetir fecha y rango (por ejemplo, «el jueves de 17:00 a 18:00»). En esta V3 conviene responder con la instrucción completa; las capturas de Siri son independientes.
- El chat retiene el texto del modelo hasta terminar. En turnos con escrituras devuelve recibos de herramientas; un fallo nunca se sustituye por un «guardado» del modelo. El usuario sigue viendo los estados de herramientas. Una cancelación/error conserva solo recibos de escrituras ya ejecutadas. El resultado de una lectura sigue pudiendo resumirse mediante IA: sus interpretaciones pueden equivocarse y deben evaluarse con uso real.
- Cumpleaños: persona estructurada, año opcional, un vínculo único a automatización anual. Próximo aviso siempre en Europe/Madrid, 11:00 inicial configurable en Datos y preferencias. El 29 de febrero se avisa el 28 en años no bisiestos y vuelve al 29 en años bisiestos. Tras ejecutar, se calcula el siguiente año; no se simula una sucesión de recordatorios independientes. Altas/ediciones de cumpleaños serializadas para evitar alarmas concurrentes. Editar/cancelar conserva/cancela el vínculo.
- Guardado: nota compatible con marcador histórico `#personal-space/guardado` más URL original, precio, enlace de fotografía y comentarios. No se visitan enlaces ni se cargan imágenes externas automáticamente. No hay scraping de precios ni subida de imágenes en esta V3.
- Siri: capability `capture` sobre tokens HMAC revocables. No permite chat, configuración, borrados ni lectura de notas. `POST /api/capture` reserva UUID antes de la IA y devuelve 202; `GET /api/capture/:id` devuelve el estado persistido, limitado al mismo token. Colisiones con otro contenido/token devuelven 409. No se repite una captura interrumpida. La revocación se comprueba también antes de cada herramienta. 20 capturas/día UTC/token, límite general de peticiones y presupuesto global de IA. Timeout 120 segundos; un trabajo abandonado pasa a error al consultarlo después de 180 segundos.
- Calendar: eventos locales `pending → claimed → created/error`, con identificadores de intento y marca `BichO:<UUID>`. Solo un claim autoriza crear; los reintentos deben reconciliar por marca. Nunca hay llamadas a EventKit desde la PWA. Los acuses se aceptan solo para un intento autorizado y el token que puede consultar el evento. `created` significa que Atajos comunicó el resultado: el servidor no puede inspeccionar Apple. Recuperación manual de envío incierto solo tras confirmar que no existe en Calendario.
- Los cumpleaños se pueden preparar para copiar **la próxima fecha** a Apple, sin recurrencia nativa anual de Apple en esta primera integración. El aviso anual BichO es independiente. La copia no se borra/cambia automáticamente si se edita después en BichO.

## Migración y copias

Migración SQL **13**, aditiva sobre esquema V2 **12**. Crea tablas V3 y añade `capability` con valor `standard` a tokens existentes. No renombra bindings, tablas anteriores ni IDs. La única modificación de configuración de aplicación es la marca visible BichO y el idioma español. No modifica hash de contraseña, SESSION_SECRET, claves VAPID, suscripciones push, sesiones, recuerdos, notas o tareas.

Cada migración y el avance de versión están dentro de una transacción; un fallo vuelve al esquema anterior. Los tests reconstruyen esquema 12 con datos, sesiones y push ficticios y verifican su conservación al aplicar 13. Los avisos importados de un archivo no se activan automáticamente. Los datos V2 antiguos de cumpleaños escritos como recuerdos se conservan, pero no se convierten automáticamente en personas con fechas inferidas: deben registrarse con una fecha clara.

Copia JSON **formato 2**, compatible al importar formato 1. Incluye las entidades V3, casillas y orden. No contiene tokens, sesiones ni claves privadas. Los nombres/URLs conflictivos conservan el elemento local; la importación no mueve hijos entre listas. Los cumpleaños existentes mantienen su fecha y automatización, y los nuevos llegan pausados. Las copias no acreditan que un evento exista en Apple: los eventos importados necesitan revisión y autorización. Importar una copia JSON no equivale a restaurar un snapshot exacto del Durable Object.

## Promoción futura — requiere aprobación explícita

**No ejecutada por el desarrollo de V3.** Mantener la URL V2 requiere actualizar su Worker y Pages existentes, conservando su instalación y almacenamiento. No usar el instalador de V3 ni generar otro manifiesto para promover.

Antes de cualquier promoción:

1. Obtener aprobación explícita del propietario sobre el commit y los resultados de pruebas de V3, incluido el iPhone.
2. Exportar por HTTPS autenticado una copia JSON de V2; guardarla localmente en un directorio privado, nunca Git. Validar JSON, formato, recuentos y SHA-256. Verificar importación en una instalación de recuperación aislada con datos protegidos; un JSON exportado por sí solo **no** es una copia de sesiones/push.
3. Registrar la versión activa del Worker y el deployment de Pages y preparar sus artefactos V2 para rollback. Registrar el bookmark de recuperación PITR del Durable Object inmediatamente anterior a la migración, mediante las herramientas oficiales de Cloudflare y comprobar su disponibilidad/ventana de retención del plan. Si no se puede disponer de recuperación del almacenamiento completo, no promover hasta resolverlo.
4. Verificar que la configuración apunta exactamente a `talorys-psstta2bu4wy-agent`, el mismo namespace/clase DO y la misma migración de binding; no recrear el namespace ni los secretos. Conservar VAPID, SESSION_SECRET, hash de contraseña, service binding y el proyecto Pages.
5. Actualizar primero el Worker y verificar esquema 13/salud/contraseña/datos preservados. Actualizar Pages y verificar login, lectura de una nota previa, listas y recordatorio de prueba, y la suscripción push existente en iPhone. No usar datos personales en prompts de prueba.
6. Ante fallo, volver a los artefactos V2 previamente registrados. El esquema aditivo conserva las tablas viejas; no eliminar tablas V3 ni intentar una «desmigración» destructiva. Si hace falta restaurar almacenamiento, usar el bookmark previamente verificado. Toda escritura posterior al snapshot debe reconciliarse antes de una restauración.

La suscripción push está vinculada al origen y a VAPID: conservar ambos y el mismo DO es esencial. Ningún dato de la preview se mezcla automáticamente con V2. Las claves de Siri de V3 deben crearse en la instalación definitiva después de promover, sin trasladar secretos por el repositorio.

## Pruebas y límites

Las pruebas automatizadas de módulo usan proveedores simulados únicamente para provocar errores/abortos de forma determinista. La aplicación desplegada nunca activa mocks. `verifyV3` usa Workers AI real, una sesión real y lecturas posteriores para comprobar persistencia y herramientas; deja un informe sin credenciales en `.personal-space/v3/verification.json`.

V2 push fue verificado personalmente por el propietario. La instalación, invocación de Siri, permisos Calendar, cancelación y deduplicación física en iPhone V3 solo se declaran probados tras su comprobación. Ver [guía de Atajos y checklist](bicho-v3-atajos.md). No hay funcionamiento sin conexión, diálogo continuado entre invocaciones de Siri, sincronización bidireccional, ni garantía de ejecución sin desbloquear iOS.

Fuentes oficiales para límites y recuperación: [Workers AI y cuota gratuita](https://developers.cloudflare.com/workers-ai/platform/pricing/), [modelos disponibles sin plan de pago, incluido GLM 4.7 Flash](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/), [límites de Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/platform/limits/), [PITR y bookmarks](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). La disponibilidad efectiva del bookmark de V2 debe verificarse antes de una promoción; no se ha modificado V2 para obtenerlo.
