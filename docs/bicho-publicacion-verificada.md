# BichO V3 publicada y verificada

Verificación completada el **6 de noviembre de 2026 a las 22:16 UTC** (23:16 en Madrid).

- URL principal: https://talorys-psstta2bu4wy-web.pages.dev
- Commit de la aplicación publicada: `54fabae4a38d3f45a81751e783d1ae4d93d18b29`.
- Versión del Worker: `17528eaf-c209-4e22-be3b-ae39a1c29ef2`.
- Deployment de Pages: `c14fec93.talorys-psstta2bu4wy-web.pages.dev` (el alias principal se mantiene).
- PR en borrador: https://github.com/xgoedix/personal-space/pull/4. No se ha hecho merge. Los commits posteriores al publicado ajustan el comprobador y la documentación, no el código de la aplicación.

## Conservación y recuperación

Copia previa completa SQL/KV/alarma y bookmark PITR, con código y referencias de recuperación del Worker y Pages. Restauración SQL local e integridad/claves foráneas comprobadas; ensayo de la migración 12→13 sin perder registros.

Directorio privado de evidencia: `.personal-space/releases/2026-11-06T22-11-23.244Z-54fabae4/`. `before.json` contiene la copia, `before.proof.json` su comprobación, `after.json` el estado final y `release.json` tiene `published: true`.

SHA-256 de la copia previa:

```text
7bb682a7c53d02b9bfe07d42e88af396110bc3ab08704344876d75099ad01300
```

Las huellas de contraseña, secreto de sesiones, claves VAPID y credenciales MCP coinciden antes y después. Se conservaron las dos sesiones y la suscripción push existentes, además de todos los registros anteriores comparados. El namespace de almacenamiento sigue siendo el mismo. La instalación original de Talorys y la preview V3 permanecen independientes y sin modificar.

## Pruebas ejecutadas

- 908 pruebas unitarias: 31 compartidas, 744 backend, 58 web y 75 instalador.
- 6 pruebas del publicador y de restauración, incluidas las siguientes actualizaciones V3 con tokens Siri ya existentes.
- 14 pruebas de navegador en escritorio y móvil, incluida actualización con borrador y sesión conservados.
- Tipos, lint sin errores (advertencias CSS preexistentes), build y comprobación del paquete en un proyecto vacío.
- En la URL principal, Workers AI ejecutó herramientas reales para crear una nota y una lista. La nota y la casilla marcada se recuperaron desde otra sesión; repetir la creación no duplicó elementos.
- Cumpleaños ficticio guardado sin año inventado y con un único recordatorio anual en la hora configurada de Madrid.
- API de Siri: nota creada por Workers AI, persistencia, reintento sin duplicados y rechazo después de revocar el token temporal.
- El proveedor push aceptó **1 notificación de prueba**, sin errores ni suscripciones eliminadas. Su recepción física en el iPhone está pendiente de confirmación.
- URL permanente devuelve el commit publicado, título/manifest **BichO**, `start_url: /`, `scope: /`, HTML revalidable, `release.json` sin caché y backend/almacenamiento/IA/push operativos.

Las pruebas usan datos ficticios. Se eliminaron las notas, listas, cumpleaños y conversación principal de prueba mediante sus identificadores; los registros operativos de verificación pueden permanecer en actividad/capturas. Los tokens temporales se revocaron y las sesiones de verificación se cerraron.

## Uso desde el iPhone

Puedes seguir usando el icono existente, sin reinstalar ni cambiar la contraseña. Si V2 quedó abierta en memoria, cierra la aplicación y vuelve a abrirla desde ese mismo icono. Las próximas versiones aprobadas usan la misma instalación y ofrecen un aviso discreto si hay una ventana antigua abierta; no descartan borradores sin confirmación.

El acceso remoto/Siri de esta instalación estaba **desactivado** y se dejó desactivado tras la prueba temporal. Para utilizar tu propio Atajo, configura la conexión en Ajustes → Siri y Atajos siguiendo [las instrucciones](bicho-v3-atajos.md). Un token de la preview no sirve para la instalación principal. Una vez configurado sobre la URL principal, no hay que volver a conectarlo por cada publicación.

Quedan por confirmar físicamente: recepción push con la aplicación cerrada, ejecución del Atajo por voz y autorización/creación de eventos en Apple Calendar. El nombre bajo el icono puede conservar la etiqueta elegida al instalarlo; la aplicación y el manifest ya se llaman BichO.

El flujo de versiones aprobadas y la recuperación se documentan en [bicho-publicacion.md](bicho-publicacion.md). No hay publicación automática de cambios no aprobados ni nuevas credenciales de Cloudflare en GitHub.
