import { describe, it, expect, vi } from "vitest";
import { overnightReminderQuestion } from "../src/bicho/reminder-intent";
import { inAgent } from "./helpers";
import { ALL_TOOLS, ToolExecutor } from "../src/tools";
import { AgentRunner } from "../src/agent/runner";
import { startCapture, captureResult } from "../src/bicho/capture";
import type { AIProvider } from "../src/ai/provider";
import type { ChatStreamEvent } from "@talorys/shared";

const receivedAt = new Date("2030-11-07T00:30:00Z"); // 01:30 Madrid
function reminderProvider(): AIProvider {
  return {
    id: "test", model: "test", billable: false,
    async generate() { throw new Error("Unexpected generation"); },
    async *stream() {},
    async *generateWithTools(r) {
      const tool = r.tools.find(t => t.name === "create_reminder")!;
      const input = { message: "PRUEBA llamar al personaje ficticio", at: "2030-11-07T12:00" };
      yield { type: "tool-start", id: "1", name: tool.name, input };
      yield { type: "tool-end", id: "1", name: tool.name, output: await tool.execute(input, "1") };
      yield { type: "text", delta: "Ya he guardado el recordatorio." };
    },
  } as AIProvider;
}

describe("mañana de madrugada", () => {
  it.each([
    ["2030-11-06T22:59:59Z", false], // 23:59
    ["2030-11-06T23:00:00Z", true], // 00:00
    ["2030-11-07T02:59:59Z", true], // 03:59
    ["2030-11-07T03:00:00Z", false], // 04:00
    ["2030-07-06T22:00:00Z", true], // summer midnight
    ["2030-07-07T02:00:00Z", false], // summer 04:00
    ["2030-03-31T01:30:00Z", true], // DST jump: 03:30
    ["2030-10-27T01:30:00Z", true], // repeated 02:30
  ])("respeta Europe/Madrid en %s", (instant, expected) => {
    expect(!!overnightReminderQuestion("Recuérdame mañana llamar", "Europe/Madrid", new Date(instant))).toBe(expected);
  });

  it("muestra ambas fechas incluso al cambiar de año y usa la zona del propietario", () => {
    const date = new Date("2030-12-31T00:30:00Z");
    const q = overnightReminderQuestion("MAÑANA llamar", "Europe/Madrid", date);
    expect(q).toContain("31/12/2030");
    expect(q).toContain("01/01/2031");
    expect(overnightReminderQuestion("mañana llamar", "America/New_York", date)).toBeNull();
  });

  it("no confunde la franja de la mañana con el día relativo", () => {
    for (const text of [undefined, "hoy a las doce", "el 8 de noviembre a las 10", "a las 9 de la mañana", "el sábado por la mañana", "pasar en la mañana"])
      expect(overnightReminderQuestion(text, "Europe/Madrid", receivedAt)).toBeNull();
    expect(overnightReminderQuestion("Mañana por la mañana llamar", "Europe/Madrid", receivedAt)).toContain("¿");
  });

  it("impide escrituras en ambas herramientas aunque la IA invente fecha o minutos", async () => {
    await inAgent(async a => {
      const before = a.services.automations.list();
      const ex = new ToolExecutor(ALL_TOOLS, { services: a.services, timezone: "Europe/Madrid", ownerInput: "Recuérdame mañana llamar", ownerInputAt: receivedAt, mode: "chat" }, { maxToolCalls: 4 });
      for (const [tool, input] of [
        ["create_reminder", { message: "PRUEBA", at: "2030-11-08T12:00" }],
        ["create_reminder", { message: "PRUEBA", in_minutes: 5 }],
        ["create_automation", { name: "PRUEBA", kind: "reminder", schedule: { type: "once", at: "2030-11-08T12:00" } }],
      ] as const) expect(await ex.execute(tool, input)).toHaveProperty("question");
      expect(a.services.automations.list()).toEqual(before);
    });
  });

  it("chat pregunta sin confirmar ni guardar; la aclaración permite guardar una sola vez", async () => {
    await inAgent(async a => {
      a.services.settings.update({ timezone: "Europe/Madrid" });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(receivedAt);
      try {
        const before = a.services.automations.list().length;
        const runner = new AgentRunner(a.services, reminderProvider());
        const events: ChatStreamEvent[] = [];
        for await (const e of runner.chat({ message: "Recuérdame mañana llamar", signal: new AbortController().signal })) events.push(e);
        const done = events.find(e => e.type === "done");
        expect(done?.type === "done" && done.message.content).toContain("día que acaba de empezar");
        expect(JSON.stringify(events)).not.toContain("Ya he guardado");
        expect(a.services.automations.list()).toHaveLength(before);
        const start = events.find(e => e.type === "start");
        if (start?.type !== "start") throw Error("Missing conversation");
        const followup: ChatStreamEvent[] = [];
        for await (const e of runner.chat({ conversationId: start.conversation_id, message: "Hoy, el día que acaba de empezar, a las doce", signal: new AbortController().signal })) followup.push(e);
        expect(a.services.automations.list()).toHaveLength(before + 1);
        expect(followup.find(e => e.type === "done")).toBeDefined();
        const saved = a.services.automations.list().find(r => r.message === "PRUEBA llamar al personaje ficticio")!;
        expect(saved.schedule).toEqual({ type: "once", at: "2030-11-07T12:00" });
        expect(saved.next_run).toBeTruthy();
      } finally { vi.useRealTimers(); }
    });
  });

  it("Siri devuelve needs_input y cero acciones incluso si la IA afirma haber guardado", async () => {
    await inAgent(async a => {
      const s = a.services;
      s.settings.update({ timezone: "Europe/Madrid" });
      s.remote.setEnabled(true);
      const token = await s.remote.create({ name: "PRUEBA madrugada", scope: "write", capability: "capture" });
      const caller = (await s.remote.validate(token.token))!;
      const before = s.automations.list();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(receivedAt);
      try {
        const input = { request_id: crypto.randomUUID(), text: "Recuérdame mañana llamar" };
        const jobs: Promise<unknown>[] = [];
        await startCapture(s, reminderProvider(), caller, input, p => jobs.push(p));
        await Promise.all(jobs);
        const result = captureResult(s, input.request_id, caller.id);
        expect(result.status).toBe("needs_input");
        expect(result.message).toContain("07/11/2030");
        expect(result.message).toContain("08/11/2030");
        expect(result.message).not.toContain("Ya he guardado");
        expect(result.actions).toHaveLength(0);
        expect(s.automations.list()).toEqual(before);
        const replay = await startCapture(s, reminderProvider(), caller, input, p => jobs.push(p));
        expect(replay).toEqual(result);
      } finally { vi.useRealTimers(); }
    });
  });
});
