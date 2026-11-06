/** Administrative RPC only. Never expose this through HTTP, chat tools or remote tokens. */
export async function checkpoint(storage: DurableObjectStorage, environment: Record<string, unknown>) {
  const bookmark = await storage.getCurrentBookmark();
  const schema = storage.sql.exec<{ name: string; type: string; sql: string | null }>("SELECT name,type,sql FROM sqlite_master ORDER BY name").toArray();
  const tables = schema.filter((row) => row.type === "table" && !row.name.startsWith("_cf_"));
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  const columns: Record<string, string[]> = {};
  for (const table of tables) columns[table.name] = storage.sql.exec<{ name: string }>(`PRAGMA table_info(${quote(table.name)})`).toArray().map((row) => row.name);
  const parts = tables.map((table, index) => `(SELECT json_group_array(json_array(${columns[table.name]!.map((column) => `quote(${quote(column)})`).join(",")})) FROM ${quote(table.name)}) AS t${index}`);
  const snapshot = storage.sql.exec<Record<string, string>>(`SELECT ${parts.join(",")}`).one();
  const rows = tables.flatMap((table, index) => (JSON.parse(snapshot[`t${index}`]!) as string[][]).map((row) => ({ table_name: table.name, row_data: JSON.stringify(row) })));
  const kv = encodeStorage([...await storage.list()]);
  const alarm = await storage.getAlarm();
  const fingerprints: Record<string, string | null> = {};
  for (const name of ["OWNER_PASSWORD_HASH", "OWNER_PASSWORD", "SESSION_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "MCP_CREDENTIAL_KEY"]) {
    const value = environment[name];
    fingerprints[name] = typeof value === "string" ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("") : null;
  }
  return { format: 1, bookmark, capturedAt: new Date().toISOString(), schema, columns, rows, kv, alarm, fingerprints };
}

/** Typed encoding for KV values; SQL/PITR remain the authoritative recovery mechanisms. */
export function encodeStorage(value: unknown): unknown {
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "bigint") return { type: "bigint", value: String(value) };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : { type: "number", value: String(value) };
  if (value instanceof Date) return { type: "date", value: value.toISOString() };
  if (value instanceof ArrayBuffer) return { type: "ArrayBuffer", value: [...new Uint8Array(value)] };
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, value: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] };
  if (value instanceof Map) return { type: "map", value: [...value].map(([key, item]) => [encodeStorage(key), encodeStorage(item)]) };
  if (value instanceof Set) return { type: "set", value: [...value].map(encodeStorage) };
  if (Array.isArray(value)) return value.map(encodeStorage);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return { type: "object", value: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeStorage(item)])) };
  throw new Error("Unsupported storage value; release backup cannot be completed.");
}
