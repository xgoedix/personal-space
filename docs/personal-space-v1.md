# Personal Space · V1

Rediseño de Talorys en el fork `xgoedix/personal-space`, rama `codex/personal-space-v1`. Conserva la licencia MIT y los créditos del proyecto original. No se ha desplegado sobre ninguna instalación existente ni se han leído sus datos o secretos.

## Arquitectura e integración

Se conserva React + Vite, TanStack Query, React Router y el cliente API de Talorys. Las llamadas reales continúan siendo del mismo origen (`/api`), con cookies de sesión y cabecera CSRF. Cloudflare Pages reenvía las peticiones por service binding al Worker privado; el agente conserva SQLite en su Durable Object, Workers AI, streaming SSE, alarmas y Web Push.

- `/`: portada con resumen derivado de tareas y recordatorios, cuatro categorías y acceso permanente al asistente.
- `/today`: tareas pendientes de hoy y anteriores, próximas/sin fecha y completadas. Crear, editar, completar, reabrir y eliminar con confirmación. Próximos recordatorios existentes.
- `/people`: memorias actuales de categoría `person`, usando las rutas existentes de memorias.
- `/saved`: notas cuya **primera línea** es exactamente `#personal-space/guardado`.
- `/ideas`: las restantes notas, sin mover ni reinterpretar notas anteriores.
- `/chat/:conversationId?`: chat original de Talorys, con su streaming, historial, reintentos, cancelación, confirmaciones destructivas y planes de tareas. Presentación y controles principales en español.
- `/settings`: instalación en iPhone, privacidad, notificaciones originales y bloqueo de sesión.

Las rutas originales `/tasks`, `/notes/:noteId?`, `/memory`, `/automations` se conservan. La configuración técnica original queda en `/settings/advanced`. Estos paneles heredados siguen disponibles por URL; su traducción y rediseño completos quedan fuera del recorrido principal de esta V1. No se han eliminado funciones de Talorys.

El único ajuste del motor, además de admitir el código de idioma `es`, es una instrucción de presentación y clasificación en `agent/prompt.ts`: respuestas en español, preguntar si faltan datos esenciales, memorias de personas y marcador de notas guardadas. No se cambian proveedores, herramientas, esquemas de almacenamiento ni procesos de notificación. El modelo sigue siendo responsable de elegir herramientas: debe probarse con Workers AI real en un entorno independiente antes de producción.

## Sistema visual

Referencia principal: cuarta imagen proporcionada. Fondo marfil `#F2EBDD`; negro cálido; pigmentos coral, amarillo, azul y lavanda mediante gradientes radiales difusos y máscara elíptica. No hay imágenes remotas, fuentes externas, analítica ni APIs añadidas. Tipografía de sistema, etiquetas monoespaciadas, marca orbital SVG e iconos Lucide.

Componentes en `apps/web/src/personal`: shell, portada, tarjetas, formulario, filtros, estados vacíos y estados de error. Transiciones contenidas; el movimiento ambiental desaparece con `prefers-reduced-motion`. Foco visible, navegación por teclado, controles con nombre accesible, inputs de 16px en móvil y zonas seguras de iOS. El diseño V1 es claro, aunque conserva la preferencia original del backend sin sobrescribirla.

## Preview independiente

Se activa **solo al compilar** con `VITE_PERSONAL_PREVIEW=true`. No se activa con una URL, cookie ni ajuste del usuario. El adaptador de preview intercepta las llamadas API, utiliza fixtures en memoria y no llama al Worker. El banner aparece en todas sus pantallas.

Las operaciones de ejemplo cambian solo la memoria de la pestaña; se reinician al recargar. El chat muestra un error explícito y conserva el borrador: no genera respuestas de IA ni afirma haber guardado nada. Las notificaciones están desconectadas. La preview se publica en un Site separado con acceso privado de su propietario. No incluye ningún backend, credencial ni binding de Talorys.

Para previsualizar localmente:

```sh
npm ci --ignore-scripts
VITE_PERSONAL_PREVIEW=true npm run dev -w @talorys/web
```

Para compilar la aplicación integrada, sin datos ficticios:

```sh
npm run build -w @talorys/web
```

No ejecutar el instalador ni `wrangler deploy` contra la instalación existente. La integración real requiere un entorno de ensayo con sus propios recursos y su autenticación, configurado por el propietario; esta entrega no lo crea ni solicita secretos.

## Límites explícitos

- Personas conserva datos como recuerdos libres. No hay tabla de contactos ni motor de cumpleaños anual nuevo. Guardar un cumpleaños **no programa** un aviso.
- Guardado reutiliza notas. No extrae metadatos de enlaces, descarga productos ni rastrea precios.
- Fecha de tarea y recordatorio son conceptos distintos. Para recibir avisos, usar las herramientas de recordatorios del asistente.
- La portada respeta la zona horaria de Talorys. La entrada manual de fechas indica que usa la zona horaria del dispositivo. No se modifica una fecha existente si no se edita.
- La PWA usa manifest, iconos nuevos y el service worker original. Requiere conexión; no almacena respuestas privadas en caché. La instalación y el dictado nativo deben comprobarse en un iPhone físico; el dictado se hace desde el teclado de iOS.
- Los textos del servidor (p. ej., avisos históricos, etiquetas de herramientas y ciertos errores) pueden conservar su idioma original. No se reescriben datos existentes para traducirlos.
- La UI solo confirma guardados tras respuesta satisfactoria. La preview etiqueta sus confirmaciones como ejemplos locales.

## Verificación

- Compilación Vite y comprobación TypeScript del monorepo.
- Suite frontend, incluida cobertura de fecha/zona horaria, clasificación conservadora, enlaces HTTP(S), traducción completa del catálogo compartido, aislamiento de preview, fallo al guardar, cookies/CSRF y streaming de errores.
- Suite compartida y pruebas del Worker en Miniflare con `remoteBindings: false` y `TALORYS_MOCK_AI=1`. No se ejecuta inferencia real.
- Revisión manual en navegador a 390 × 844 y escritorio: portada, navegación, creación de tarea ficticia, cambio de estado, formularios y fallo honesto del chat.
- Pendiente: IA y notificaciones reales, instalación PWA/dictado en iPhone físico y paneles heredados fuera del recorrido V1.

### Resultados de esta entrega

- TypeScript del monorepo y build del frontend: correctos.
- 50 pruebas frontend, 25 compartidas, 719 Worker y 64 del instalador: correctas (858 en total).
- 2 pruebas del instalador omitidas por la suite al no existir los templates empaquetados de distribución.
- Las primeras ejecuciones de Worker e instalador fallaron por permisos de sockets locales. Se repitieron con acceso a sockets; pasaron sin cambiar sus pruebas.
- Preview privada: https://personal-space-diego-v1.lloragu.chatgpt.site . Requiere iniciar sesión con la cuenta de ChatGPT propietaria. La autenticación de la aplicación integrada sigue siendo la original de Talorys.
