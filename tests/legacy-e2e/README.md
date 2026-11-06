# Suite histórica de Talorys

Estos escenarios describen la navegación inglesa de Talorys anterior a Personal Space V1/V2. En V3 se ejecutó la suite con `--max-failures=1`: el primer escenario exige un título «Talorys» que ya no existía en V2. Otros escenarios presuponen una barra de navegación y una página Settings que BichO no utiliza.

Se conservan completos, sin falsear sus resultados. Para ejecutarlos: `npx playwright test -c playwright.legacy.config.ts`. No se declaran aprobados ni se incluyen en la cifra de pruebas superadas. La suite activa `tests/e2e/bicho.spec.ts` verifica el contrato español actual (escritorio y móvil); los tests de backend siguen cubriendo autenticación, herramientas, permisos, sesiones, push y almacenamiento de Talorys.

Las antiguas pruebas específicas de interfaz para historial de memoria, MCP/recuperación semántica y edición avanzada de notas todavía requieren adaptación a las rutas de BichO. Esta separación no acredita esas pantallas como probadas en E2E.
