import { expect, it, vi } from "vitest";
import { imageCandidates, loadPicture } from "../src/bicho/link-images";
import { SavedPreviews } from "../src/bicho/saved-previews";
import { client, inAgent, loggedIn } from "./helpers";

const png = Uint8Array.fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=");
const page = "https://example.com/shop/item";
const markup = `<meta name="twitter:image" content="/twitter"><meta property="og:image" content="/social">
<script type="application/ld+json">{"@graph":[{"@type":"Product","image":{"@id":"#image"}},{"@id":"#image","@type":"ImageObject","contentUrl":"/main"}]}</script>
<div itemtype="https://schema.org/Product"><img itemprop="image" src="/gallery"></div>`;

it("prioritizes product structured data and galleries before social metadata", async () => {
  expect(await imageCandidates(markup, page)).toEqual(["main","gallery","social","twitter"].map(p => "https://example.com/"+p));
});

it("tries real image bytes in order and preserves a chosen photograph", async () => {
  const fetched: string[] = [];
  const network: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com") return Response.json({Answer:[{type:1,data:"93.184.216.34"}]});
    fetched.push(url.pathname);
    if (url.href === page) return new Response(markup,{headers:{"content-type":"text/html"}});
    if (["/social","/manual"].includes(url.pathname)) return new Response(png);
    return new Response("missing photo");
  };
  expect((await loadPicture(page,"","",network))?.mime).toBe("image/png");
  expect(fetched).toEqual(["/shop/item","/main","/gallery","/social"]);
  fetched.length = 0;
  expect((await loadPicture(page,"https://example.com/manual","",network))?.url).toContain("/manual");
  expect(fetched).toEqual(["/manual"]);
  expect(await loadPicture("http://localhost/item","","",network)).toBeNull();
});

it("enriches legacy notes once, survives reopening, and discards stale work and missing images", async () => {
  const c = await loggedIn();
  const {note} = await c.json("/api/notes",{method:"POST",body:{title:"Prueba miniatura",content:"#personal-space/guardado\n"+page}});
  await inAgent(async a => {
    const {db,notes} = a.services;
    const lookup = vi.fn(async () => ({url:page+"/photo",mime:"image/png",bytes:png}));
    const previews = new SavedPreviews(db,lookup);
    await Promise.all([previews.get(note.id),previews.get(note.id)]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect((await new SavedPreviews(db,lookup).get(note.id))!.bytes).toEqual(png);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(notes.require(note.id)).toEqual(note);
  });
  const path = "/api/saved-links/"+note.id+"/preview";
  expect((await client().call(path)).status).toBe(401);
  const served = await c.call(path);
  expect(served.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
  await inAgent(async a => {
    const {db,notes} = a.services;
    notes.update(note.id,{content:"#personal-space/guardado\n"+page+"/changed"});
    const miss = vi.fn(async () => null);
    const previews = new SavedPreviews(db,miss);
    const stale = previews.get(note.id);
    notes.update(note.id,{content:"#personal-space/guardado\n"+page+"/new"});
    expect(await stale).toBeNull();
    await previews.get(note.id);
    await previews.get(note.id);
    expect(miss).toHaveBeenCalledTimes(2);
    expect(db.one("SELECT data FROM tal_saved_preview_chunks WHERE note_id=?",note.id)).toBeNull();
  });
  await c.call("/api/notes/"+note.id,{method:"DELETE"});
  expect((await c.call(path)).status).toBe(404);
});
