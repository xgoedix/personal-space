# BichO V3 · Siri y Calendario

Estos atajos usan exclusivamente tu instalación BichO y las acciones nativas de Apple. No usan ChatGPT, servicios puente ni una suscripción. Requieren internet. La configuración de Siri y Calendario **debe probarse en el iPhone**; las pruebas automáticas del servidor no acreditan permisos ni creación de eventos en Apple.

Para la instalación principal de BichO utiliza `https://talorys-psstta2bu4wy-web.pages.dev`. Las futuras versiones aprobadas conservan ese origen y los tokens creados allí. La preview es independiente: sus tokens no se trasladan a la instalación principal.

## 1. Conexión privada

En BichO → Ajustes → Siri y Atajos, crea una conexión llamada «Siri · iPhone». Copia el token que se muestra una sola vez. Guárdalo únicamente en la acción Texto del atajo privado. Atajos puede sincronizarse mediante tu iCloud: no publiques ni compartas un atajo que lo contenga. Si lo compartiste, revócalo en BichO y crea otro.

Permisos del token: captura de instrucciones, consulta de listas y cumpleaños mediante herramientas, consulta/acuse de sus eventos o eventos autorizados expresamente. No puede leer notas, historial de chat, ajustes ni otros tokens; tampoco eliminar información. Límite persistente: 20 capturas nuevas por día UTC y conexión, además del límite global de IA. Reconsultar el resultado no gasta IA.

## 2. Atajo «Apunta en Bicho»

Abre **Atajos → +** y usa ese nombre. Siri invoca el nombre del atajo: «Oye Siri, apunta en Bicho». La marca en la aplicación sigue siendo **BichO**. Si Siri confunde el nombre, renombra solo el atajo, por ejemplo «Apunta en mi espacio». No hace falta añadir la acción Abrir app.

Añade estas acciones, en orden. Los nombres pueden variar ligeramente con el idioma o versión de iOS. Selecciona las variables indicadas desde las variables mágicas, no escribas sus nombres como texto literal.

1. **Texto**: pega el token. **Establecer variable** → `Token`.
2. **Texto**: `https://talorys-psstta2bu4wy-web.pages.dev`, sin `/` final. **Establecer variable** → `Base`.
3. **Solicitar entrada**: texto, pregunta «¿Qué quieres apuntar?». **Establecer variable** → `Instruccion`.
4. **Generar UUID**. **Establecer variable** → `Solicitud`. Se genera una sola vez por instrucción, nunca dentro del bucle.
5. **URL**: `[Base]/api/capture`. **Obtener contenido de URL**:
   - Método **POST**.
   - Cabeceras: `Authorization` = `Bearer [Token]`; `Content-Type` = `application/json`.
   - Cuerpo **JSON**: `request_id` (Texto) = `[Solicitud]`; `text` (Texto) = `[Instruccion]`.
6. **Establecer variable** → `Resultado`, con la respuesta de la petición.
7. **Repetir 40 veces**, con estas acciones dentro:
   - **Obtener valor del diccionario**, clave `status`, diccionario `Resultado`.
   - **Si** el valor es `running`: **Esperar 3 segundos**; **URL** `[Base]/api/capture/[Solicitud]`; **Obtener contenido de URL** con método **GET** y cabecera `Authorization: Bearer [Token]`; **Establecer variable Resultado** con esta respuesta. **Fin de Si**.
   - Si ya terminó, la iteración no consulta nada. **Fin de Repetir**.
8. **Obtener valor del diccionario** `status` de `Resultado`. **Si** es `running`: **Mostrar resultado** «BichO sigue procesando. No se confirma ningún guardado; revisa la app antes de repetir»; **Detener este atajo**. **Fin de Si**.
9. **Obtener valor del diccionario** `message` de `Resultado`. **Si** no tiene ningún valor: **Mostrar resultado** «No se pudo confirmar la captura. Revisa BichO»; **Detener este atajo**. **Fin de Si**.
10. **Mostrar resultado** con `message`. Opcionalmente **Leer texto** con el mismo valor. No añadas un texto fijo «Guardado»: el servidor devuelve las confirmaciones reales o el error.

La primera ejecución pedirá permiso para contactar con tu dominio. Autoriza solo ese dominio. Prueba primero con «Guarda una nota que diga PRUEBA SIRI V3». Después prueba con la PWA cerrada. Siri puede pedir desbloquear el iPhone; no se puede garantizar una ejecución completamente invisible en todas las versiones de iOS.

Si la red falla, Atajos detendrá la acción de red: eso no significa que el servidor no haya guardado nada. Consulta BichO antes de lanzar una nueva captura. Un reintento técnico de la misma petición debe conservar **Solicitud e Instruccion idénticas**. Nunca reenvíes automáticamente con un UUID nuevo. El servidor reserva el UUID antes de llamar a la IA y devuelve siempre el resultado almacenado; si el proceso se interrumpió no vuelve a ejecutar escrituras automáticamente.

Si BichO pide una aclaración, vuelve a invocar el atajo con la instrucción completa ya aclarada. Esta primera versión no mantiene una conversación de voz entre invocaciones. En mensajes con varias acciones, completa solo la que haya quedado pendiente para no repetir las ya confirmadas.

## 3. Atajo opcional «Calendario de BichO»

La captura anterior **solo guarda eventos en BichO**. Este segundo atajo crea los eventos nativos con tu autorización. Puedes ejecutarlo cuando quieras o añadir **Ejecutar atajo → Calendario de BichO** al final de «Apunta en Bicho»; siempre conserva la confirmación por evento.

1. Configura `Base` y `Token` como arriba. **Obtener contenido de URL**: GET `[Base]/api/capture/calendar`, cabecera `Authorization: Bearer [Token]`.
2. Obtén la clave `events` del diccionario. **Repetir con cada elemento**. El elemento actual es `Evento`. Si la lista está vacía, no hay eventos pendientes autorizados para esa conexión.
3. Extrae de `Evento` las claves `id`, `title`, `start_at`, `end_at`, `notes` y `apple_status`. Los tiempos son ISO 8601 con zona UTC: usa **Obtener fechas de la entrada** para convertir `start_at` y `end_at`, sin eliminar la `Z` ni aplicar otro desplazamiento.
4. **Mostrar aviso** con título, inicio y fin: «¿Crear este evento en Apple Calendar?». Activa **Mostrar botón Cancelar**. Cancelar detiene el atajo sin crear ni acreditar nada.
5. Usa `id` del evento como variable `Intento` (ya es un UUID). Este identificador estable permite recuperar el mismo envío tras un corte. POST `[Base]/api/calendar/events/[id]/claim`, cabeceras anteriores, cuerpo JSON: `confirmed` **Booleano verdadero**, `attempt_id` **Texto** `[Intento]`.
6. Obtén `create_allowed` de la respuesta. Guárdalo como `CrearPermitido`. Si `event.apple_status` es `created`, no crees otro evento y pasa al siguiente. Si no, continúa para comprobar si quedó un evento pendiente de acreditar. Si la respuesta contiene `error`, muestra `error.message` y detén el atajo.
7. Forma el texto `BichO:[id]` como variable `Marca`. **Buscar eventos de calendario** con filtro **Notas contiene Marca**. Busca en todos los calendarios a los que has dado acceso y elimina el filtro predeterminado de «próximos 7 días»; el evento puede estar en otra fecha.
8. Si la búsqueda devuelve más de un resultado, muestra «Hay varios eventos con esta marca; revisa Calendario» y detén el atajo. Si devuelve uno, reutilízalo como `EventoApple`. **No crees otro.** Si no devuelve ninguno y `CrearPermitido` es falso, muestra «El envío anterior quedó pendiente: comprueba Calendario y los permisos antes de repetir» y detén el atajo. Este bloqueo evita duplicados cuando no puede verificarse qué pasó.
9. Solo si no hay coincidencia y `CrearPermitido` es verdadero, usa **Añadir nuevo evento**: título `[title]`, inicio/fin convertidos, notas `[notes]` más una línea con `[Marca]`. Elige tu calendario personal en el parámetro Calendario. Mantén **Mostrar hoja de composición** activado: revisa y pulsa **Añadir**. Si se cancela o no devuelve evento, detén el atajo sin acuse `created`.
10. Antes del acuse, vuelve a **Buscar eventos de calendario** por la marca, como en el paso 7. Debe devolver **exactamente uno**. Si no, muestra «No puedo confirmar la creación; revisa Calendario» y detente. Esta verificación también detecta una cancelación en la hoja nativa.
11. POST `[Base]/api/calendar/events/[id]/ack`, con las mismas cabeceras y cuerpo JSON: `attempt_id` (Texto) `[Intento]`, `status` (Texto) `created`, `calendar_name` (Texto) el nombre del calendario del evento encontrado. Si **Obtener detalles de eventos de calendario** ofrece un identificador estable en tu versión, envíalo también como `external_id`; si no, omite esa clave. Nunca inventes un ID.
12. Comprueba que la respuesta tiene `event.apple_status = created` y muestra «Evento creado en Apple Calendar». En cualquier otro caso, muestra el error: el evento puede existir aunque haya fallado el acuse, por eso el siguiente intento debe buscar su marca primero.

No añadas un acuse `created` fuera de la rama que ha comprobado el evento. No interpretes un fallo de red como prueba de que Calendario está vacío. El endpoint admite `status: error` para un cliente que pueda acreditar que **no** creó el evento; el atajo manual deja el estado pendiente ante cualquier resultado incierto. Para desbloquear un envío pendiente sin evento, comprueba primero todos tus calendarios y que ningún otro dispositivo esté ejecutando el atajo. En BichO → Hoy → Eventos → Recuperar envío interrumpido, confirma explícitamente que no existe. Después puedes reintentar. No se reinicia automáticamente.

### Permisos de Apple

Al ejecutar el atajo por primera vez, Apple pedirá acceso a Calendario y al dominio BichO. Permite los calendarios que quieras utilizar. Para detectar duplicados hace falta leer los eventos, no solo añadirlos. Si deniegas la lectura o la escritura, detén el atajo: BichO conserva el evento como pendiente. No se necesitan Contactos, Fotos, ubicación ni acceso a todos tus archivos.

La elección de calendario queda guardada en el parámetro de la acción nativa del atajo, no en el servidor. Para cambiarla, edita ese parámetro. Los eventos sincronizados muestran en BichO «confirmado por Atajos»: el servidor no dispone de acceso directo a EventKit para comprobar tu calendario.

### Cumpleaños

En Personas → cumpleaños → **Copiar próxima fecha a Calendario**, prepara el próximo cumpleaños. Después, en Hoy → Eventos → **Autorizar envío a Atajos**, elige tu conexión. Ejecuta «Calendario de BichO».

Esta primera integración copia **una fecha concreta**, con la misma deduplicación por marca; no crea una serie anual en Apple. BichO sí mantiene su aviso anual real a las 11:00 de Madrid, independiente de Calendario. No se añaden alertas de Apple desde el código, pero el calendario elegido puede tener sus propias alertas predeterminadas: revísalas en la hoja de composición.

No hay sincronización bidireccional: editar o borrar en Apple no cambia BichO, y corregir/eliminar el cumpleaños cancela o cambia su aviso de BichO, no una copia anterior en Apple. Una fase posterior puede añadir un App Intent nativo con EventKit y acceso explícito a recurrencias e identificadores. No se introduce CalDAV ni una contraseña de iCloud en el servidor.

## 4. Prueba en iPhone

- Abre el icono que ya tienes instalado para la URL principal. No lo elimines ni reinstales. Si pruebas una preview aislada, sus permisos y suscripciones son independientes.
- Crea por voz una nota, cierra la app y vuelve a entrar: debe permanecer.
- Crea una lista con tres elementos; marca uno y vuelve a abrirla desde otro dispositivo.
- Di «El cumpleaños de Persona Prueba es el 18 de mayo»: Personas debe mostrar un único aviso anual a las 11:00 Madrid. Repítelo y comprueba que no aparece otro.
- Di «Tengo dentista el jueves a las cinco»: debe preguntar, sin crear un evento. Repite con la instrucción completa, fecha inequívoca y duración.
- Ejecuta Calendario de BichO: cancela primero y comprueba que no aparece ningún evento. Vuelve a ejecutarlo autorizando; comprueba el calendario de destino. Repítelo y verifica que sigue habiendo uno solo.
- Programa un recordatorio a cinco minutos, cierra la PWA y comprueba el push. V2 ya fue comprobada físicamente por el propietario; eso no acredita este origen nuevo.
- Revoca la conexión Siri en Ajustes. El atajo debe fallar sin guardar ni dar una confirmación de éxito.

Referencias de Apple consultadas: [invocación con Siri](https://support.apple.com/es-es/HT209055), [Solicitar entrada](https://support.apple.com/guide/shortcuts/use-the-ask-for-input-action-apd68b5c9161/ios), [peticiones HTTP y JSON](https://support.apple.com/en-az/guide/shortcuts/apd58d46713f/ios), [buscar y filtrar eventos](https://support.apple.com/en-asia/guide/shortcuts/apd3c845e881/ios), [seguridad de Atajos](https://support.apple.com/es-es/guide/security/secec043bdae/1/web/1). El montaje específico de BichO es una implementación nuestra; su ejecución física sigue pendiente de la prueba del propietario.
