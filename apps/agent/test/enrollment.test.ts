import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../src/auth/auth-service";
import { inAgent, client, password } from "./helpers";

const nextPassword = "Solo-pruebas-V3-9842";
describe("alta móvil de preview", () => {
  beforeEach(async () => { await inAgent(a => {
    for (const key of ["auth.password_override", "auth.enrollment_closed", "auth.enrollment_requests"]) a.services.settings.delete(key);
  }); });
  it("las rutas públicas no permiten activación ni acceso a V2", async () => {
    const c = client();
    expect((await c.call("/api/auth/enrollment", { method: "POST", body: { password: nextPassword } })).status).toBe(404);
    expect((await c.call(`/api/auth/enrollment/${crypto.randomUUID()}/approve`, { method: "POST", body: {} })).status).toBe(401);
    expect((await c.call("/api/auth/enrollment", { method: "POST", body: { password: nextPassword }, headers: { origin: "https://evil.example" } })).status).toBe(403);
  });
  it("solo el propietario activa el hash elegido, cierra el alta y revoca el acceso temporal", async () => {
    await inAgent(async a => {
      const s = a.services;
      const auth = new AuthService(s.db, s.settings, { password: password(), sessionSecret: "e".repeat(64), enrollment: "1", installationId: "biv3test1234" });
      const owner = await auth.login(password(), "test-owner", "test");
      const session = await auth.validate(owner.token);
      const first = await auth.proposeEnrollment(nextPassword);
      const second = await auth.proposeEnrollment("Otra-prueba-284762");
      await expect(auth.login(nextPassword, "test-guest", "test")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      expect(() => auth.approveEnrollment(first.request_id, null)).toThrow();
      expect(() => auth.approveEnrollment(crypto.randomUUID(), session)).toThrow();
      expect(JSON.stringify(s.settings.getJson("auth.enrollment_requests"))).not.toContain(nextPassword);
      auth.approveEnrollment(first.request_id, session);
      expect(auth.enrollmentAvailable()).toBe(false);
      expect(await auth.validate(owner.token)).toBeNull();
      await expect(auth.login(password(), "test-old", "test")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(auth.login("Otra-prueba-284762", "test-other", "test")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      const accepted = await auth.login(nextPassword, "test-new", "test");
      expect(await auth.validate(accepted.token)).toBeTruthy();
      await expect(auth.proposeEnrollment(nextPassword)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(() => auth.approveEnrollment(second.request_id, session)).toThrow();
      expect(s.settings.getJson("auth.enrollment_requests")).toBeNull();
    });
  });
  it("limita solicitudes concurrentes y rechaza las caducadas", async () => {
    await inAgent(async a => {
      const s = a.services;
      const auth = new AuthService(s.db, s.settings, { password: password(), sessionSecret: "e".repeat(64), enrollment: "1", installationId: "biv3test1234" });
      const owner = await auth.login(password(), "owner", "test");
      const session = await auth.validate(owner.token);
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => auth.proposeEnrollment(nextPassword)));
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(5);
      expect(results.filter(r => r.status === "rejected")).toHaveLength(3);
      const requests = s.settings.getJson<{ id: string; hash: string; expires: number }[]>("auth.enrollment_requests")!;
      s.settings.setJson("auth.enrollment_requests", requests.map(r => ({ ...r, expires: Date.now() - 1 })));
      expect(() => auth.approveEnrollment(requests[0]!.id, session)).toThrow();
      expect(auth.enrollmentAvailable()).toBe(true);
    });
  });
});
