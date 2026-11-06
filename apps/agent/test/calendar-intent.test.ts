import { describe, it, expect } from "vitest";
import { calendarTimingQuestion } from "../src/bicho/calendar-intent";
import { inAgent } from "./helpers";
import { AgentRunner } from "../src/agent/runner";
import type { AIProvider } from "../src/ai/provider";

describe("horarios sin inferencias del modelo", () => {
  it("exige aclarar mañana/tarde y duración y admite rangos u horas explícitas", () => {
    const start = "2030-11-20T17:00", end = "2030-11-20T18:00";
    for (const source of [undefined, "Tengo dentista el jueves a las cinco", "Dentista a las cinco de la tarde", "de 17:00 a 19:00"])
      expect(calendarTimingQuestion(source, start, end)).toContain("¿");
    for (const source of ["Dentista el jueves de 17:00 a 18:00", "de cinco a seis de la tarde", "a las cinco de la tarde durante una hora", "a las 17 durante 60 minutos"])
      expect(calendarTimingQuestion(source, start, end)).toBeNull();
  });
  it("si la IA inventa un horario, no escribe ni confirma la creación", async () => {
    await inAgent(async a => {
      const before = a.services.bicho.events().length;
      const provider = {
        id: "test", model: "test", billable: false,
        async generate() { throw new Error("Unexpected generation in this test"); },
        async *stream() {},
        async *generateWithTools(r) {
          const tool = r.tools.find(t => t.name === "create_calendar_event")!;
          const input = { title: "Dentista PRUEBA", start: "2030-11-20T17:00", end: "2030-11-20T18:00" };
          yield { type: "tool-start", id: "1", name: tool.name, input };
          const output = await tool.execute(input, "1");
          yield { type: "tool-end", id: "1", name: tool.name, output };
          yield { type: "text", delta: "Ya he guardado el evento." };
        },
      } as AIProvider;
      const runner = new AgentRunner(a.services, provider);
      const events = [];
      for await (const e of runner.chat({ message: "Tengo dentista el jueves a las cinco", signal: new AbortController().signal })) events.push(e);
      const done = events.find(e => e.type === "done");
      expect(done?.type === "done" && done.message.content).toContain("¿Qué horario");
      expect(JSON.stringify(events)).not.toContain("Ya he guardado");
      expect(a.services.bicho.events()).toHaveLength(before);
    });
  });
});
