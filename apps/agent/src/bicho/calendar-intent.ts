/** Conservative evidence check: model-generated times alone cannot authorize a calendar write. */
export function calendarTimingQuestion(source: string | undefined, start: string, end: string): string | null {
  const text = (source ?? "").normalize("NFKC").toLocaleLowerCase("es");
  const question = "¿Qué horario tendrá el evento? Indica inicio y fin, por ejemplo «el jueves de 17:00 a 18:00». No he guardado el evento todavía.";
  const pm = /\b(tarde|noche|p\.?m\.?)\b/.test(text);
  const am = /\b(madrugada|de la mañana|a\.?m\.?)\b/.test(text);
  const times: number[] = [];
  const add = (hourText: string, minutes = "00") => {
    let hour = Number(hourText);
    if (hour < 0 || hour > 23 || Number(minutes) > 59) return;
    if (hour < 13 && !hourText.startsWith("0")) {
      if (!pm && !am) return;
      if (pm && hour < 12) hour += 12;
      if (am && hour === 12) hour = 0;
    }
    times.push(hour * 60 + Number(minutes));
  };
  for (const m of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) add(m[1]!, m[2]!);
  // Siri may transcribe hours as words or bare numbers.
  const words = ["una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce"];
  const normalized = text.replace(new RegExp(`\\b(${words.join("|")})\\b`, "g"), word => String(words.indexOf(word) + 1));
  for (const m of normalized.matchAll(/(?:\ba las|\bde|\ba|\bhasta(?: las)?)\s+(\d{1,2})(?![\d:])\b/g)) add(m[1]!);
  const toMinutes = (date: string) => Number(date.slice(11, 13)) * 60 + Number(date.slice(14, 16));
  if (!times.includes(toMinutes(start))) return question;
  const explicitRange = times.includes(toMinutes(end)) && times.length >= 2 && /\b(a|hasta|fin|termina)\b/.test(text);
  const duration = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(horas?|minutos?)\b/);
  const durationMinutes = /\bmedia hora\b/.test(text) ? 30 : duration ? Number(duration[1]!.replace(",", ".")) * (duration[2]!.startsWith("hora") ? 60 : 1) : null;
  const proposedMinutes = (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 60_000;
  return explicitRange || (durationMinutes !== null && durationMinutes === proposedMinutes) ? null : question;
}
