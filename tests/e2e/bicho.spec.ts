import { test, expect, type Page } from "@playwright/test";

const password = process.env.TALORYS_DEV_PASSWORD || "talorys-dev-password";
const name = (label: string) => `PRUEBA ${label} ${crypto.randomUUID().slice(0, 8)}`;
async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar en mi espacio" }).click();
  await expect(page.getByRole("heading", { name: "Hola, Diego." })).toBeVisible();
}
async function createList(page: Page, title: string) {
  await page.goto("/lists");
  await page.getByRole("button", { name: "Nueva lista" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear lista", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  return page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

test("acceso privado en español y navegación de cinco secciones @mobile", async ({ page, request }) => {
  expect((await request.get("/api/lists")).status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "BichO", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta-prueba-123");
  await page.getByRole("button", { name: "Entrar en mi espacio" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await login(page);
  for (const section of ["HOY", "PERSONAS", "GUARDADO", "IDEAS", "LISTAS"])
    await expect(page.getByRole("link", { name: new RegExp(`^${section}`) })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cuéntame algo..." })).toBeVisible();
  await page.getByRole("link", { name: /^HOY/ }).click();
  const reminders = page.getByRole("link", { name: "Ver todos y editar" });
  await expect(reminders).toHaveAttribute("href", "/automations");
  await reminders.click();
  await expect(page).toHaveURL(/\/automations$/);
  await expect(page.locator("main")).toBeVisible();
});

test("listas: casillas, orden, edición y confirmación de borrado persisten @mobile", async ({ page }) => {
  await login(page);
  const title = name("Compra");
  let card = await createList(page, title);
  for (const item of ["Huevos", "Leche"]) {
    await card.getByLabel(`Añadir a ${title}`).fill(item);
    await card.getByRole("button", { name: "Añadir elemento", exact: true }).click();
    await expect(card.getByRole("checkbox", { name: item, exact: true })).toBeVisible();
  }
  await card.getByRole("checkbox", { name: "Huevos", exact: true }).click();
  await expect(card.getByRole("checkbox", { name: "Huevos", exact: true })).toBeChecked();
  await card.getByRole("button", { name: "Subir Leche" }).click();
  await expect(card.getByRole("checkbox").first()).toHaveAccessibleName("Leche");
  await page.reload();
  card = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card.getByRole("checkbox", { name: "Huevos", exact: true })).toBeChecked();
  await card.getByRole("button", { name: "Editar Leche" }).click();
  await page.getByLabel("Texto", { exact: true }).fill("Leche de avena");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(card.getByRole("checkbox", { name: "Leche de avena" })).toBeVisible();
  await card.getByRole("button", { name: `Eliminar lista ${title}`, exact: true }).click();
  await page.getByRole("button", { name: "Conservar", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: `Eliminar lista ${title}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("un fallo de guardado mantiene el formulario y muestra el error @mobile", async ({ page }) => {
  await login(page);
  await page.goto("/lists");
  await page.route("**/api/lists", async route => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Fallo de escritura de prueba" } }) });
  });
  await page.getByRole("button", { name: "Nueva lista" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill(name("No guardar"));
  await page.getByRole("button", { name: "Crear lista", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Fallo de escritura de prueba");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Guardado conserva URL original, precio y comentarios al recargar @mobile", async ({ page }) => {
  await login(page);
  await page.goto("/saved");
  const title = name("Bolso");
  let available = true;
  await page.route("**/api/saved-links/*/preview?*", route => available
    ? route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64")})
    : route.fulfill({status:404}));
  const url = `https://example.com/bolso?color=azul&prueba=${encodeURIComponent(title)}`;
  await page.getByRole("button", { name: "Guardar algo" }).click();
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Enlace original").fill(url);
  await page.getByLabel("Precio (opcional)").fill("42 €");
  await page.getByLabel("Comentarios", { exact: true }).fill("Solo datos ficticios");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(card.getByRole("link",{name:"example.com"})).toHaveAttribute("href",url);
  await expect.poll(() => card.locator("img").evaluateAll(images => images.some(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  available = false;
  await page.reload();
  await expect(card.locator(".saved-picture")).toBeVisible();
  await expect(card.locator("img")).toHaveCount(0);
  await expect(card.getByRole("link",{name:"example.com"})).toHaveAttribute("href",url);
  await page.getByRole("button", { name: new RegExp(`GUARDADO ${title}`) }).click();
  await expect(page.getByLabel("Enlace original")).toHaveValue(url);
  await expect(page.getByLabel("Precio (opcional)")).toHaveValue("42 €");
  await expect(page.getByLabel("Comentarios", { exact: true })).toHaveValue("Solo datos ficticios");
});

test("cumpleaños: fecha sin año y aviso anual de Madrid @mobile", async ({ page }) => {
  await login(page);
  await page.goto("/people");
  const title = name("Persona");
  await page.getByRole("button", { name: "Añadir cumpleaños", exact: true }).click();
  await page.getByLabel("Persona", { exact: true }).fill(title);
  await page.getByLabel("Día", { exact: true }).fill("18");
  await page.getByLabel("Mes", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Guardar y activar aviso anual" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.reload();
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(card).toContainText("11:00");
  await expect(page.getByText(/Europe\/Madrid/)).toBeVisible();
  await card.getByRole("button", { name: "Copiar próxima fecha a Calendario" }).click();
  await expect(page.getByRole("dialog")).toContainText("Prepara solo el próximo cumpleaños");
});

test("Siri incluye guía y permisos; bloquear elimina el acceso @mobile", async ({ page }) => {
  await login(page);
  await page.goto("/settings/siri");
  await expect(page.getByRole("heading", { name: /Siri y Calendario/ }).first()).toBeVisible();
  await expect(page.getByText(/No añadas un acuse/)).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Bloquear mi espacio" }).click();
  await expect(page.getByRole("heading", { name: "BichO", exact: true })).toBeVisible();
  expect((await page.request.get("/api/lists")).status()).toBe(401);
});

test("actualización disponible conserva el borrador hasta autorizar la recarga @mobile", async ({ page }) => {
  await page.route('**/release.json', route => route.fulfill({ json: { version: 'release-test-new-version' }, headers: { 'cache-control': 'no-store' } }));
  await login(page);
  await page.goto('http://localhost:8788/chat');
  await page.locator('textarea').fill('Borrador sin enviar');
  await expect(page.getByRole('button', { name: 'Actualizar', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue('Borrador sin enviar');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(page.locator('textarea')).toHaveValue('');
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
});
