# BichO: trabajo y publicaciones

La aplicación principal está en https://talorys-psstta2bu4wy-web.pages.dev. Mantener esta URL, el diseño editorial aprobado, el nombre exacto **BichO** y el idioma español.

- Desarrollar en una rama independiente. Usar una preview aislada cuando haga falta revisión; no sustituir la instalación principal para enseñar un cambio no aprobado.
- Publicar únicamente después de la aprobación explícita del propietario para los cambios concretos. Asociar esa aprobación al SHA que se publica. Una vez recibida, no pedirla de nuevo para ejecutar el procedimiento autorizado.
- Antes de publicar, leer `docs/bicho-publicacion.md` y utilizar `npm run bicho:release -- --approved-sha SHA --publish`. El proceso exige copia verificable, ensayo de migración y comparación de datos y claves. No omitir estas comprobaciones.
- No hacer merge por defecto. Publicar en Pages no requiere modificar `main` de Git. No configurar despliegues automáticos por push ni tratar CI verde como aprobación.
- No modificar la instalación original de Talorys (`talorys-etfd7yab-*`). El destino permitido por el publicador es únicamente `talorys-psstta2bu4wy-*` y su namespace existente.
- Conservar contraseña, sesiones, datos, claves VAPID, suscripciones push y configuración. No volver a ejecutar el instalador sobre la instalación principal, regenerar secretos, cambiar la identidad de la PWA, borrar su service worker o recrear almacenamiento.
- Usar datos ficticios para pruebas. No imprimir credenciales, contenido personal o copias privadas; `.personal-space/` nunca entra en Git. Usar OAuth seguro para cualquier autorización necesaria, sin pedir tokens o contraseñas por chat.
- Mantener Cloudflare Workers AI y servicios compatibles con el plan gratuito. No activar facturación ni servicios de pago.
- Si falla una verificación, detener la publicación y conservar el informe. No restaurar datos automáticamente: podrían haberse creado registros después de la copia.
- Distinguir pruebas automatizadas de la confirmación física en iPhone de push, Siri y Calendar. No declarar esas pruebas físicas superadas sin confirmación del propietario.

El procedimiento permanente, la recuperación y el comportamiento de actualización de la PWA están en `docs/bicho-publicacion.md`; la última entrega verificada, en `docs/bicho-publicacion-verificada.md`.
