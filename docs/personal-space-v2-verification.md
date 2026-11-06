# Personal Space V2 — backend verificado, iPhone pendiente

URL funcional: https://talorys-psstta2bu4wy-web.pages.dev

Verificación real terminada el **6 de noviembre de 2026, 20:14:04 (Europe/Madrid)**.

## Resultado de la prueba real

- API privada: notas, recordatorios y push rechazan el acceso anónimo.
- Inicio de sesión real con cookie protegida.
- Worker correcto, Workers AI real, modo demo desactivado y zona Europe/Madrid.
- Claves Web Push configuradas en staging.
- IA ejecutó create_note y se verificó la nota 48736bf9-4263-4d48-a16a-f60ef633c770 en SQLite.
- Nota conservada después de cerrar sesión e iniciar otra independiente.
- Recordatorio persistido b036ab77-a5f7-482d-a7c5-e09095f96893, ejecución prevista 2026-11-06T19:14:00.000Z.
- Consulta de pendientes mediante herramientas reales.
- Alarma ejecutada sin aplicación abierta; notificación persistida 64003635-cc46-4808-9241-1799b6bbfc46.

Datos exclusivamente de prueba, identificados con `PRUEBA-V2-5a62d0da`. La nota se conserva en Ideas y el aviso en el centro de notificaciones para revisarlos. Las sesiones creadas por el verificador se cierran al terminar.

El recordatorio se pidió en español para cinco minutos después. Talorys lo programó a las **20:14** con su precisión de minutos; a las **20:14:04** ya se había verificado la notificación almacenada y una ejecución satisfactoria de la automatización. Durante la espera no había navegador ni conexión de chat abierta por el verificador; solo consultas HTTP periódicas al centro de notificaciones.

## Pruebas locales y web

- **866 pruebas**: 25 shared, 720 backend, 50 web y 71 instalador. Incluyen persistencia, autenticación, automatizaciones, push, bloqueo de recursos de producción y las regresiones del formulario y de la comprobación del título.
- Typecheck del monorepo y revalidación de los paquetes modificados.
- Compilación del paquete sin fixtures de la preview visual.
- HTTPS: página de Personal Space 200, sesión anónima no autenticada, notas privadas 401.
- Manifiesto PWA con `standalone` y service worker de notificaciones disponibles.

## Instalación aislada

- Worker privado: `talorys-psstta2bu4wy-agent`.
- Web separada: `talorys-psstta2bu4wy-web`.
- SQLite Durable Object independiente y claves de sesión/push propias.
- No se han leído ni modificado datos personales de producción; no se ha desplegado sobre Talorys original ni hecho merge a main.
- No se ha activado ningún plan de pago ni añadido un proveedor externo.

El informe local completo está en `.personal-space/staging/verification.json`, excluido de Git junto con los archivos locales de despliegue. No contiene contraseña ni cookies.

## Comprobación manual pendiente

**No se ha verificado la recepción push en un iPhone.** El propietario ha indicado que la probará después. Tener las claves VAPID configuradas y una notificación en el servidor no demuestra la entrega en el dispositivo.

Abrir la URL en Safari, añadir la PWA a la pantalla de inicio, iniciar sesión desde su icono y activar Ajustes → Notificaciones → Este dispositivo. Enviar una prueba; después pedir un recordatorio nuevo a cinco minutos, cerrar la app y comprobar su recepción.

La verificación completa de V2 queda pendiente de esa prueba. Pasos detallados y forma de repetir las pruebas automáticas sin redesplegar: [guía de staging](personal-space-v2-staging.md).
