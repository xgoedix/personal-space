# Publicación permanente de BichO

La instalación principal conserva **https://talorys-psstta2bu4wy-web.pages.dev**. El proyecto Pages, el Worker, el namespace de Durable Objects, el nombre de la instancia `personal-agent`, las claves y las suscripciones push se reutilizan. El Talorys original `talorys-etfd7yab-*` queda fuera del procedimiento.

## Flujo de versiones aprobadas

1. Desarrollar en una rama independiente; ejecutar pruebas y mostrar una preview aislada cuando haga falta.
2. Recibir la aprobación del propietario para el cambio concreto. Registrar la aprobación en el chat/PR y el SHA completo que se va a publicar. Un `push`, un PR o una prueba correcta **no son una aprobación**.
3. Desde un checkout limpio de ese SHA, ejecutar:

   ```sh
   npm ci
   npm run bicho:release -- --approved-sha SHA_COMPLETO --publish
   ```

   Sin `--publish`, el comando solo realiza la preparación, las pruebas y la copia. `--notify-test` añade una notificación de prueba real a los dispositivos ya suscritos; usarlo únicamente cuando esa comprobación esté autorizada.
4. Conservar el informe privado de `.personal-space/releases/FECHA-SHA/release.json`. Solo `published: true` significa que se verificó la publicación completa.

Este flujo usa **Cloudflare/Wrangler con OAuth**, ya disponible en el equipo de publicación. No depende de `main`, no hace merge ni activa despliegues al subir cambios. No requiere nuevas contraseñas de la PWA ni códigos de preview. Si caduca la autorización de Cloudflare, el operador utiliza `npx wrangler login`, mediante la página oficial; nunca se envían credenciales por chat.

No se ha instalado un token permanente de Cloudflare en GitHub. El acceso OAuth conserva los permisos concedidos a Wrangler; el script restringe de forma explícita los destinos al Worker, proyecto y namespace de BichO. Este control no convierte el OAuth en una credencial limitada a un único recurso. Una futura ejecución en GitHub Actions deberá usar un token dedicado con los permisos que requieran Workers Scripts y Pages en esta cuenta, almacenado en un **Environment con aprobación obligatoria**, y validar que el flujo no pueda publicar desde un push o PR. No copiar el token OAuth local a GitHub ni utilizar una API key global.

## Comprobaciones y copia

El comando valida el SHA aprobado, que el checkout esté limpio y que el destino sea exactamente BichO. Ejecuta lint, tipos, pruebas unitarias, empaquetado y navegador antes de desplegar.

La copia administrativa contiene todas las tablas SQL —incluidas sesiones, credenciales cifradas y suscripciones push—, los valores KV con sus tipos, la alarma y un bookmark de recuperación PITR. Las claves secretas del Worker **no se exportan**: se conservan en Cloudflare y se comparan mediante huellas antes y después. Se guarda además la versión anterior del Worker, su código descargado, sus bindings, el deployment anterior de Pages y el manifest.

Se restaura el SQL en un archivo SQLite local, se comprueban integridad, claves foráneas y filas y se ensayan las migraciones pendientes. Las migraciones que incorporen código adicional (`after`) requieren ampliar y revisar ese ensayo antes de publicar. Una migración incompatible o una diferencia en datos/credenciales detiene el proceso. Las tablas FTS son índices derivados y se reconstruyen desde sus tablas de contenido.

Los archivos privados quedan fuera de Git, en directorios con permisos `0700` y copias `0600`. Contienen información personal: deben conservarse en almacenamiento privado del propietario, no adjuntarse a un PR. `before.proof.json` incluye SHA-256, integridad y comprobaciones de la migración. Cloudflare ofrece [PITR de SQL y KV durante 30 días](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#point-in-time-recovery-api); la copia local permite conservar evidencia más allá de esa ventana.

La publicación actualizó primero V2 con operaciones privadas de recuperación, después de restaurar y verificar una copia SQL de V2. Ese paso reutilizó el código descargado de la instalación y no cambió sus datos ni su lógica de aplicación. Las siguientes versiones ya disponen del respaldo completo antes de empezar.

## Despliegue y verificación

Se publica primero el backend sin cambiar namespace, clase, migración de Cloudflare `v1`, secretos ni bindings. La migración de aplicación V2→V3 es la 13, aditiva y transaccional. Se comparan los registros y huellas; solo después se publica la web sobre la rama de producción del proyecto Pages existente. El argumento `--branch main` de Pages **no modifica la rama Git ni hace merge**.

Se comprueban el SHA servido por la URL permanente, identidad PWA, acceso privado y estado real de almacenamiento, IA y push. Una sesión administrativa temporal, obtenida únicamente mediante RPC con autorización de la cuenta Cloudflare, caduca a los cinco minutos y se revoca al terminar. No reemplaza la contraseña ni las sesiones del propietario y no está expuesta por HTTP, tokens de Siri o herramientas de la IA.

Las pruebas remotas usan datos ficticios identificados con un UUID: herramientas de Workers AI, nota, lista, casilla, lectura desde otra sesión y cumpleaños sin duplicar su aviso. Se limpian los registros de prueba creados. El estado previo de acceso remoto/Siri se conserva. Si estaba desactivado y no hay tokens existentes, se activa temporalmente para una captura de prueba con token revocable y se vuelve a desactivar al terminar. Si existen tokens desactivados, no se reactivan para probar. Se indica si falta configurar el Atajo del propietario. Las pruebas automatizadas de Siri y Calendar y la verificación anterior de la preview no sustituyen una prueba física del Atajo en el iPhone.

Si una comprobación falla después de publicar el Worker o Pages, el informe distingue `workerPublished`, `webPublished` y `published`. No se restaura automáticamente la base: eso podría eliminar información introducida después de la copia. Investigar el fallo antes de continuar.

## Recuperación

1. Detener nuevos despliegues y conservar los informes de antes/después. No desinstalar la PWA ni regenerar secretos.
2. Para un problema solo visual, volver al deployment de Pages indicado en `previousPagesDeployment`, desde **Cloudflare → Workers & Pages → BichO → Deployments → Rollback**. [Procedimiento de Cloudflare](https://developers.cloudflare.com/pages/configuration/rollbacks/).
3. Para volver al código anterior del Worker, revisar la compatibilidad del esquema y utilizar el `previousWorkerVersion` del informe con `wrangler rollback VERSION --config deploy/bicho/wrangler.jsonc`. Un rollback de código no restaura los datos.
4. Restaurar datos solo con autorización explícita del propietario y tras guardar otra copia del estado actual. El método RPC administrativo `bichoReleaseRestore(bookmark)` programa la recuperación del **mismo Durable Object** y lo reinicia. El bookmark de `before.json` sirve únicamente dentro de la ventana PITR de Cloudflare. La desconexión causada por el reinicio no prueba el éxito: obtener un nuevo checkpoint y comparar los registros antes de volver a abrir el acceso.
5. Si PITR ya no está disponible, preparar una restauración aislada de SQL y KV desde la copia, revisar los tipos codificados y las alarmas y verificarla antes de reemplazar datos. El importador habitual de la aplicación no es un sustituto: excluye sesiones y push.

## PWA e iPhone

Se mantiene el mismo manifest, `start_url: /`, `scope: /`, iconos y registro `/sw.js`. No se llama a `unregister`, no se borran suscripciones ni almacenamiento local. La identidad implícita del manifest no cambia. El nombre mostrado dentro de la aplicación es BichO; iOS puede conservar el texto elegido para el icono cuando se instaló.

La interfaz se obtiene de red con revalidación; no existe una caché offline de páginas o respuestas privadas. Los assets con hash permanecen inmutables. `release.json` usa `no-store`; el service worker usa `no-cache` y `updateViaCache: none`. Al volver a una ventana abierta se comprueba la versión y se ofrece un aviso discreto. No se recarga durante una operación ni se descarta un borrador sin confirmación. Al abrir una nueva instancia se carga la versión publicada. Se conservan los chunks de la última publicación reproducible para ventanas antiguas.

El service worker sigue gestionando push. Si el navegador renueva una suscripción, su reemplazo se guarda de forma atómica: un error de registro conserva la anterior.

No es necesario eliminar ni reinstalar el icono actual. En la primera transición desde V2, si iOS conserva la pantalla anterior en memoria, cerrar la aplicación y volver a abrirla desde el mismo icono. Después, las versiones aprobadas se reciben por ese mismo origen.

Comprobaciones físicas pendientes para cada cambio relevante:

- Abrir el icono existente, comprobar BichO y la sesión/datos habituales.
- Recibir una notificación con la PWA cerrada y abrirla tocando el aviso.
- Ejecutar el Atajo contra la URL principal y comprobar la respuesta y el dato guardado.
- Autorizar Calendario en Atajos y comprobar un evento sin duplicados. La web no tiene acceso directo a EventKit.

Las instrucciones de Siri y Calendar están en [bicho-v3-atajos.md](bicho-v3-atajos.md). Los tokens de una preview pertenecen a esa instalación: no se copian a la principal. Una vez configurado el Atajo para la URL permanente, las publicaciones conservan sus tokens y configuración.
