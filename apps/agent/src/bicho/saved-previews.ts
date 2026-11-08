/// <reference lib="esnext.typedarrays" />
import type { Database } from "../db/database";
import { loadPicture, type LinkPicture } from "./link-images";

const CACHE_BUDGET = 8 * 1024 * 1024;
const CHUNK_SIZE = 96 * 1024;
const RETRY_DELAY = 12 * 60 * 60 * 1000;

interface Source { page: string; preferred: string }

export class SavedPreviews {
  private pending = new Map<string, Promise<LinkPicture | null>>();

  constructor(private db: Database, private load = loadPicture) {}

  private source(id: string): Source | null {
    const row = this.db.one<{ content: string; url: string | null; image_url: string | null }>(
      "SELECT n.content,l.url,l.image_url FROM tal_notes n LEFT JOIN tal_saved_links l ON l.note_id=n.id WHERE n.id=?", id,
    );
    if (!row) return null;
    const [marker, ...body] = row.content.split("\n");
    if (marker?.trim() !== "#personal-space/guardado") return null;
    const page = row.url ?? body.join("\n").match(/https?:\/\/[^\s<>]+/i)?.[0];
    return page ? { page, preferred: row.image_url ?? "" } : null;
  }

  async get(id: string): Promise<LinkPicture | null> {
    const source = this.source(id);
    if (!source) return null;
    const hit = this.db.one<{ image_url: string; mime: string; retry_at: number }>(
      "SELECT image_url,mime,retry_at FROM tal_saved_previews WHERE note_id=? AND page_url=? AND preferred_url=?",
      id, source.page, source.preferred,
    );
    if (hit?.image_url) {
      const chunks = this.db.all<{ data: string }>("SELECT data FROM tal_saved_preview_chunks WHERE note_id=? ORDER BY position", id);
      if (chunks.length) return { url: hit.image_url, mime: hit.mime, bytes: Uint8Array.fromBase64(chunks.map(c => c.data).join("")) };
    }
    if (hit && hit.retry_at > Date.now()) return null;
    const key = JSON.stringify([id, source]);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const work = this.resolve(id, source, hit?.image_url ?? "").finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async resolve(id: string, source: Source, previous: string) {
    const picture = await this.load(source.page, source.preferred, previous);
    const current = this.source(id);
    if (!current || current.page !== source.page || current.preferred !== source.preferred) return null;
    this.db.transaction(() => {
      this.db.run("DELETE FROM tal_saved_previews WHERE note_id=?", id);
      this.db.run(
        "INSERT INTO tal_saved_previews(note_id,page_url,preferred_url,image_url,mime,retry_at,cached_at) VALUES(?,?,?,?,?,?,?)",
        id, source.page, source.preferred, picture?.url ?? "", picture?.mime ?? "", picture ? 0 : Date.now() + RETRY_DELAY, Date.now(),
      );
      if (!picture) return;
      const encoded = picture.bytes.toBase64();
      for (let pos = 0; pos < encoded.length; pos += CHUNK_SIZE) {
        this.db.run("INSERT INTO tal_saved_preview_chunks(note_id,position,data) VALUES(?,?,?)", id, pos, encoded.slice(pos, pos + CHUNK_SIZE));
      }
      // Keep URLs for evicted pictures. Only their derived image data is disposable.
      const sizes = this.db.all<{ note_id: string; size: number }>(
        "SELECT p.note_id,SUM(length(c.data)) AS size FROM tal_saved_previews p JOIN tal_saved_preview_chunks c ON p.note_id=c.note_id GROUP BY p.note_id ORDER BY p.cached_at DESC,(p.note_id=?) DESC,p.note_id", id,
      );
      let used = 0;
      for (const entry of sizes) {
        used += entry.size;
        if (used > CACHE_BUDGET) this.db.run("DELETE FROM tal_saved_preview_chunks WHERE note_id=?", entry.note_id);
      }
    });
    return picture;
  }
}
