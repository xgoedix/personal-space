# Personal Space V2 — staging independiente

El staging conecta la interfaz aprobada con el backend original de Talorys. No importa datos, credenciales ni suscripciones push de producción. No modifica ni despliega la rama `main` de GitHub.

## Desplegar desde este repositorio

Requisitos: Node 22+, dependencias instaladas con `npm ci`, sesión de Cloudflare autorizada mediante `npx wrangler login` (OAuth en el navegador). No pegar tokens ni contraseñas en el chat.

```sh
npm run staging:prepare
npm run staging:deploy
```

El segundo comando imprime una URL local de un solo uso para configurar la contraseña. Abrirla en el mismo ordenador, introducir y confirmar una contraseña nueva y enviar el formulario. Si hay varias cuentas, el instalador necesita seleccionar una antes de continuar; no elige una arbitraria.

El formulario escucha exclusivamente en `127.0.0.1`, valida el origen y un token aleatorio, y no utiliza recursos externos. La contraseña se mantiene en memoria durante la instalación y la prueba HTTPS; no aparece en argumentos de procesos, archivos, registros ni el repositorio. Su hash PBKDF2 y las claves aleatorias de sesión, VAPID y MCP se envían a Cloudflare mediante stdin de Wrangler. Las credenciales OAuth siguen gestionadas por Wrangler.

La carpeta local `.personal-space/staging` está excluida de Git. Su `talorys.json` identifica los recursos y permite reanudar un despliegue sin duplicarlos ni sustituir las claves push. No eliminar esa carpeta para actualizar. Repetir ambos comandos y usar la contraseña existente. Una contraseña incorrecta no reemplaza la ya configurada.

Para repetir solo las comprobaciones sobre un staging ya desplegado, sin publicar nada de nuevo:

```sh
npm run staging:deploy -- --verify-only
```

## Aislamiento

- Worker: `talorys-psst<8 caracteres>-agent`, sin URL pública ni URL de preview.
- Almacenamiento: Durable Object con SQLite, creado dentro del Worker nuevo. Ningún binding referencia el Worker de producción.
- Web: `talorys-psst<8 caracteres>-web.pages.dev`. Su función `/api/*` tiene un único service binding hacia el Worker correspondiente.
- Autenticación: contraseña nueva y cookie `HttpOnly`, `Secure`, `SameSite=Strict`; las API privadas exigen sesión y las mutaciones protección CSRF.
- El prefijo obligatorio y la comprobación del manifiesto impiden reutilizar `talorys-etfd7yab` o cualquier otro recurso fuera del staging.
- El `--branch main` que utiliza Pages publica en el dominio estable del **nuevo proyecto de staging**. No hace checkout, push ni merge de la rama `main` de GitHub.
- La web se compila forzando `VITE_PERSONAL_PREVIEW=false`; el empaquetado rechaza los fixtures de V1. No hay respuestas IA simuladas en esta instalación.

## Servicios y límites gratuitos

Se reutilizan Pages, Workers, Workers AI y Durable Objects SQLite. No se activan planes, AI Gateway, proveedores externos, R2, D1 ni Vectorize. La búsqueda semántica opcional queda desactivada.

Cloudflare permite [Durable Objects SQLite en Workers Free](https://developers.cloudflare.com/durable-objects/platform/pricing/) y [Workers AI con una asignación gratuita diaria](https://developers.cloudflare.com/workers-ai/platform/pricing/). El modelo de Talorys es `@cf/zai-org/glm-4.7-flash`, que no figura entre los modelos que requieren método de pago en la documentación consultada el 6 de noviembre de 2026. En Free, agotar la cuota causa un error; el instalador nunca acepta una ampliación de plan. Las cuotas son de la cuenta y se comparten con otras instalaciones. Si la cuenta ya tiene un plan de pago, sus condiciones existentes siguen aplicándose: este script no cambia la facturación ni puede convertir una cuota de cuenta en una cuota aislada por Worker.

## Verificación real automática

Después de desplegar, el instalador ejecuta `staging-smoke.ts` exclusivamente contra la URL derivada del manifiesto validado:

1. Rechazo del acceso anónimo a notas, recordatorios y push.
2. Inicio de sesión HTTPS y atributos de la cookie.
3. Identificador del Worker, proveedor `workers-ai`, demo desactivada y zona `Europe/Madrid`.
4. Claves VAPID disponibles.
5. Instrucción española para crear una nota con identificador `PRUEBA-V2-…`. Exige un evento satisfactorio de `create_note` y consulta la nota almacenada.
6. Cierre de sesión, nueva sesión independiente y lectura de la misma nota.
7. Instrucción española para crear un recordatorio en cinco minutos. Exige un evento satisfactorio de `create_reminder` y consulta su programación persistida.
8. Consulta de pendientes mediante herramientas.
9. Espera del disparo de la alarma sin navegador ni conexión de chat abierta; consulta la notificación almacenada y el historial satisfactorio de la automatización.

Los ejemplos están etiquetados como pruebas y se dejan visibles para revisión. El resultado satisfactorio se escribe en `.personal-space/staging/verification.json`, sin contraseña ni cookies. Si un paso falla, se informa del fallo y no se emite un informe de éxito. Las sesiones de prueba se cierran al terminar.

**Una prueba de alarma del servidor no demuestra la recepción de una notificación en el iPhone.** Esa comprobación requiere una suscripción real de ese dispositivo.

## Prueba manual en iPhone

1. Abrir la URL de staging en Safari e iniciar sesión con la contraseña elegida.
2. Compartir → Añadir a la pantalla de inicio. Abrir Personal Space desde ese icono e iniciar sesión si se solicita.
3. Ajustes → Notificaciones → activar «Este dispositivo» y aceptar el permiso de iOS.
4. Pulsar «Enviar prueba» y comprobar que aparece una notificación. El estado «enviada» indica aceptación por el servicio push, no garantiza que iOS la haya mostrado.
5. Escribir: «Recuérdame dentro de 5 minutos que tengo que llamar a alguien. Es una prueba del iPhone».
6. Comprobar que la acción aparece como ejecutada y el recordatorio figura en Hoy. Cerrar la aplicación y bloquear el teléfono.
7. Comprobar la recepción. Talorys programa con precisión de minutos y redondea hacia arriba, por lo que cinco minutos pueden llegar a casi seis. Al tocar la notificación debe abrirse la PWA.
8. Volver a abrir la aplicación y comprobar también la nota de prueba en Ideas.

iOS requiere una PWA instalada y permisos de notificación. El modo concentración y los ajustes de notificaciones del dispositivo pueden afectar a su presentación. No se almacenan respuestas privadas en la caché del service worker; se necesita conexión para consultar y guardar información.

## Estado de entrega

La V2 no se considera terminada hasta completar el despliegue y la verificación HTTPS. La recepción push en el iPhone debe registrarse por separado como comprobación manual. La preview estática V1 no es la URL funcional de V2.
