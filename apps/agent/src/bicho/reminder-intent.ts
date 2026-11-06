/** Check the owner's words and local receipt time, never a date invented by the model. */
export function overnightReminderQuestion(source: string | undefined, timezone: string, receivedAt = new Date()): string | null {
  const text = (source ?? "").normalize("NFKC").toLocaleLowerCase("es")
    .replace(/\b(?:de|por|en)\s+la\s+mañana\b/g, "");
  if (!/\bmañana\b/.test(text)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(receivedAt);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  if (Number(part("hour")) >= 4) return null;
  const today = `${part("day")}/${part("month")}/${part("year")}`;
  const next = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")) + 1));
  const nextLabel = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(next);
  return `¿Con «mañana» te refieres al día que acaba de empezar, hoy (${today}), o al siguiente (${nextLabel})? No he guardado el recordatorio todavía.`;
}
