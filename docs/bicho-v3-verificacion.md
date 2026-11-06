# BichO V3 · Estado de verificación

Preview aislada: https://talorys-biv3bj4cwnor-web.pages.dev

La URL V2 `https://talorys-psstta2bu4wy-web.pages.dev`, su contraseña, almacenamiento y suscripciones no se han modificado. Tampoco Talorys original. No hay merge ni promoción a V2. La preview utiliza exclusivamente datos ficticios.

## Backend real

Verificación HTTPS con Workers AI (GLM 4.7 Flash), Durable Object SQLite y sesión privada el 6 de noviembre de 2026. El comprobador vuelve a leer cada entidad después de las herramientas; no sustituye operaciones por respuestas de prueba.

- Acceso anónimo rechazado; comprobación de instalación, proveedor, modo real y zona Europe/Madrid.
- Un mensaje crea una lista con tres elementos y una tarea para mañana, sin añadir una notificación a la tarea.
- Una casilla permanece marcada tras cerrar sesión y abrir una sesión independiente. Repetir la lista conserva su ID y sus elementos.
- La IA guarda una persona sin inventar año de nacimiento y programa un único aviso anual a las 11:00 Madrid.
- El enlace original y el precio permanecen en Guardado.
- «Tengo dentista el jueves a las cinco» pide aclaración y no aumenta el número de eventos. Se detectó una inferencia incorrecta del modelo en la primera prueba; se añadió una comprobación de horario en la herramienta y se volvió a verificar el resultado.
- La API de Siri recibe una instrucción, ejecuta Workers AI y persiste una nota y un evento. Reenviar exactamente el UUID y el texto devuelve el resultado previo, sin repetir escrituras.
- El token de captura no puede leer notas, configuración ni otros tokens. Tras revocarlo se rechaza su uso.
- Los eventos permanecen pendientes en BichO: no se ha simulado su creación en Apple. Una petición sin autorización de Calendario se rechaza.
- Exportación autenticada disponible. El informe reproducible, sin credenciales, queda en `.personal-space/v3/verification.json` (ignorado por Git).

## Automatizadas y navegador

- 740 pruebas de backend; 31 de shared; 50 de frontend; 75 de instalador. Incluyen migración desde esquema 12 con datos/sesión/push ficticios, 29 de febrero, cambios de hora, siguiente año, fallos del planificador, concurrencia, revocación, límites de captura, permisos y acuses de Calendar, alta móvil y confirmaciones falsas del modelo.
- Comprobación de tipos y compilación correctas. Lint sin errores; 22 advertencias de especificidad CSS del estilo existente.
- Paquete instalable probado desde un proyecto vacío contra Cloudflare simulado; reinstalación idempotente.
- Escenarios E2E actuales en escritorio y móvil: acceso privado español, navegación, listas/casillas/orden/edición/borrado confirmado, errores de escritura, Guardado al recargar, cumpleaños y guía/bloqueo. La suite histórica inglesa de Talorys se conserva en `tests/legacy-e2e`, con ejecución independiente y límites documentados: no se cuenta como aprobada.
- Comprobación visual adicional a 390 × 844: Personas, Listas y Guardado; persistencia de precio, comentarios y URL al recargar. Se corrigieron un botón de formulario que no enviaba y un área táctil de casilla que se superponía a otras filas.

## Pendiente del propietario

El alta móvil debe completarse desde Safari: elegir contraseña en la preview, enviar únicamente el UUID de solicitud al operador y, tras su activación, actualizar e iniciar sesión. El UUID no permite acceder por sí mismo; la contraseña nunca se envía por el chat. Hasta confirmar la activación no se declara entregado el acceso personal.

La instalación PWA V3, invocación física de Siri, permisos y creación real en Apple Calendar, cancelación/reintento sin duplicados y recepción push de esta preview con la PWA cerrada requieren prueba en el iPhone. V2 push sí fue confirmado personalmente por el propietario, pero no acredita el nuevo origen. No se declara terminada la V3 ni lista para promoción hasta revisar estas comprobaciones.

Guía: [Atajos, permisos y checklist de iPhone](bicho-v3-atajos.md). Arquitectura, copias y requisitos para una promoción autorizada: [desarrollo seguro](bicho-v3-desarrollo.md).

## Límites de esta entrega

- Siri no mantiene conversación entre invocaciones: ante una aclaración, repetir la instrucción completa. Puede requerir desbloquear el iPhone.
- Calendar es un envío unidireccional mediante Atajos, con permiso y reconciliación por marca. El estado «creado» acredita el acuse del cliente; el servidor no tiene acceso a EventKit.
- La copia de un cumpleaños a Apple prepara su próxima fecha, no una serie anual de Apple. El aviso anual de BichO funciona de forma independiente.
- No se importan ni mezclan datos de V2 en la preview. Los cumpleaños antiguos guardados como recuerdos se conservan; no se inventan fechas para migrarlos automáticamente.
- Las fotografías se guardan como enlaces; no hay subida de imágenes ni scraping. Las funciones requieren conexión y quedan sujetas a la cuota gratuita de Workers AI.
